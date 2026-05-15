/**
 * VoiceChatManager — WebRTC peer connection manager for real-time voice chat.
 *
 * Design:
 * - One RTCPeerConnection per remote participant (full mesh topology).
 * - Local mic stream is shared across all peer connections.
 * - Muting flips the `enabled` flag on audio tracks (no need to renegotiate).
 * - Speaking detection is based on AudioContext AnalyserNode RMS energy.
 */

import { socketService } from './socket';

export interface VoiceChatEvents {
  onSpeakingUser: (userId: string, speaking: boolean) => void;
  onRemoteStream: (userId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved: (userId: string) => void;
  onError: (err: Error) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export class VoiceChatManager {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  get peers(): Map<string, RTCPeerConnection> {
    return this.peerConnections;
  }
  private speakingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private speakingAnimationId: number | null = null;
  private events: VoiceChatEvents;
  private currentUserId: string;
  private isMuted = false;
  /** Per-peer <audio> elements so we can silence incoming audio independently */
  private remoteAudioEls = new Map<string, HTMLAudioElement>();

  constructor(currentUserId: string, events: VoiceChatEvents) {
    this.currentUserId = currentUserId;
    this.events = events;
  }

  // ── Lifecycle ───────────────────────────────────────────

  async start(): Promise<void> {
    console.log('[VoiceChat] start() — requesting microphone access');
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }, video: false });
      console.log('[VoiceChat] start() — mic access granted, tracks:', this.localStream.getAudioTracks().length);
      this.setupAnalyser();
      this.setupLocalAudio(); // hear self for feedback
    } catch (err) {
      console.error('[VoiceChat] start() — mic access denied:', (err as Error).message);
      this.events.onError(new Error(`无法访问麦克风: ${(err as Error).message}`));
    }
  }

  stop(): void {
    console.log('[VoiceChat] stop() — tearing down all connections');
    this.stopAnimationLoop();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.speakingTimers.forEach((t) => clearTimeout(t));
    this.speakingTimers.clear();
    this.remoteAudioEls.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    this.remoteAudioEls.clear();
  }

  // ── Muting ──────────────────────────────────────────────

  get muted(): boolean {
    return this.isMuted;
  }

  set muted(value: boolean) {
    this.isMuted = value;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
    console.log(`[VoiceChat] remoteAudioEls size: ${this.remoteAudioEls.size}`)
    console.log(`[VoiceChat] muted = ${value} — local mic tracks ${value ? 'disabled' : 'enabled'}`);
  }

  // ── Deafen (silence incoming audio) ─────────────────────

  private isSilenced = false;

  get silenced(): boolean {
    return this.isSilenced;
  }

  set silenced(value: boolean) {
    this.isSilenced = value;
    // Mute all remote audio elements
    this.remoteAudioEls.forEach((el) => {
      el.volume = value ? 0 : 1;
    });
    console.log(`[VoiceChat] silenced = ${value} — ${this.remoteAudioEls.size} remote audio els volume set to ${value ? 0 : 1}`);
  }

  // ── Peer management ────────────────────────────────────

  /**
   * Called when the server sends a WebRTC offer from a remote peer.
   * Returns the answer to be sent back through the signaling channel.
   */
  async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    console.log(`[VoiceChat] handleOffer from ${fromUserId}`);
    await this.ensurePeer(fromUserId);
    const pc = this.peerConnections.get(fromUserId)!;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`[VoiceChat] handleOffer — answer created for ${fromUserId}`);
    return answer;
  }

  /**
   * Called when the server relays an answer back to the offer sender.
   */
  async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (!pc) {
      console.warn(`[VoiceChat] handleAnswer — no PC for ${fromUserId}`);
      return;
    }
    try {
      // Avoid "invalid state transition" if already have-remote-pranswer or stable
      const validStates = ['have-local-offer', 'have-remote-pranswer'];
      if (!validStates.includes(pc.signalingState)) {
        console.warn(`[VoiceChat] handleAnswer — unexpected signalingState=${pc.signalingState} for ${fromUserId}, forcing setRemoteDescription`);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[VoiceChat] handleAnswer — remote desc set for ${fromUserId}, state: ${pc.signalingState}`);
    } catch (err) {
      console.warn(`[VoiceChat] handleAnswer — failed for ${fromUserId}: ${(err as Error).message}, state: ${pc.signalingState}`);
    }
  }

  /**
   * Called when the server relays an ICE candidate from a remote peer.
   */
  async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (!pc) {
      console.warn(`[VoiceChat] ICE candidate for unknown peer ${fromUserId} (PC not found) — was answer dropped?`);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[VoiceChat] ICE candidate added for ${fromUserId}: ${candidate.candidate?.slice(0, 60)}…`);
    } catch (err) {
      // ICE candidates can arrive before remote description is set; this is benign
      console.warn(`[VoiceChat] ICE candidate error for ${fromUserId} (may be queued): ${(err as Error).message}`);
    }
  }

  /**
   * Initiate a call to a new remote peer: create offer and send via socket.
   * The caller is responsible for emitting the offer over signaling.
   */
  async initiateCall(toUserId: string): Promise<RTCSessionDescriptionInit | null> {
    console.log(`[VoiceChat] initiateCall to ${toUserId}`);
    await this.ensurePeer(toUserId);
    const pc = this.peerConnections.get(toUserId)!;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log(`[VoiceChat] initiateCall — offer created for ${toUserId}`);
    return offer;
  }

  /**
   * Remove a peer (e.g., when they leave the room).
   */
  removePeer(userId: string): void {
    console.log(`[VoiceChat] removePeer ${userId}`);
    this.peerConnections.get(userId)?.close();
    this.peerConnections.delete(userId);
    const t = this.speakingTimers.get(userId);
    if (t) clearTimeout(t);
    this.speakingTimers.delete(userId);
    this.remoteAudioEls.get(userId)?.pause();
    this.remoteAudioEls.delete(userId);
    this.events.onRemoteStreamRemoved(userId);
  }

  // ── Private helpers ─────────────────────────────────────

  private async ensurePeer(peerId: string): Promise<RTCPeerConnection> {
    if (this.peerConnections.has(peerId)) return this.peerConnections.get(peerId)!;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local audio tracks to new peer connections
    this.localStream?.getAudioTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    pc.ontrack = (event: RTCTrackEvent) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.events.onRemoteStream(peerId, remoteStream);
        console.log(`[VoiceChat] ontrack from ${peerId} — ${remoteStream.getAudioTracks().length} audio tracks`);
        // Attach remote stream to an audio element so the user can hear the peer
        const audioEl = new Audio();
        audioEl.srcObject = remoteStream;
        audioEl.autoplay = true;
        audioEl.volume = this.isSilenced ? 0 : 1;
        this.remoteAudioEls.set(peerId, audioEl);
        audioEl.play()
          .then(() => console.log(`[VoiceChat] remote audio playing for ${peerId}`))
          .catch((e) => console.warn(`[VoiceChat] remote audio play() failed for ${peerId}:`, e.message));
      } else {
        console.log(`[VoiceChat] ontrack from ${peerId} — no remote stream`);
      }
    };

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        console.log(`[VoiceChat] local ICE candidate for ${peerId}: ${event.candidate.candidate?.slice(0, 60)}…`);
        socketService.emitVoiceIceCandidate(peerId, event.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[VoiceChat] ICE state [${peerId}]: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[VoiceChat] PC state [${peerId}]: ${pc.connectionState}`);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        console.log(`[VoiceChat] PC [${peerId}] ${pc.connectionState} — x`);
        this.removePeer(peerId);
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  private setupAnalyser(): void {
    if (!this.localStream) return;
    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.localStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this.startAnimationLoop();
  }

  private setupLocalAudio(): void {
    if (!this.localStream) return;
    // Play local audio through speakers (so user can hear themselves)
    const audioEl = new Audio();
    audioEl.srcObject = this.localStream;
    audioEl.volume = 0;
    audioEl.play().catch(() => {});
  }

  private startAnimationLoop(): void {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + (v / 255) ** 2, 0) / buf.length);
      const speaking = !this.isMuted && rms > 0.02;
      if (speaking) {
        if (!this.speakingTimers.has('local')) {
          this.events.onSpeakingUser(this.currentUserId, true);
        }
        this.speakingTimers.get('local') && clearTimeout(this.speakingTimers.get('local')!);
        const t = setTimeout(() => {
          this.events.onSpeakingUser(this.currentUserId, false);
          this.speakingTimers.delete('local');
        }, 1200);
        this.speakingTimers.set('local', t);
      }
      this.speakingAnimationId = requestAnimationFrame(tick);
    };
    this.speakingAnimationId = requestAnimationFrame(tick);
  }

  private stopAnimationLoop(): void {
    if (this.speakingAnimationId !== null) {
      cancelAnimationFrame(this.speakingAnimationId);
      this.speakingAnimationId = null;
    }
  }
}
