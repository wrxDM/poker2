/**
 * useVoiceChat — React hook for WebRTC voice chat.
 *
 * Manages the VoiceChatManager lifecycle and syncs mute state with the game store.
 * Exposes speaking state for all participants so UI can render indicators.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { VoiceChatManager } from '../services/VoiceChatManager';
import { socketService } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import type { PlayerPublic } from '../types';

export interface UseVoiceChatReturn {
  /** Whether the local user is muted (others can't hear them) */
  isMuted: boolean;
  /** Toggle mute state (mic on/off) */
  toggleMute: () => void;
  /** Set mute state directly */
  setMuted: (muted: boolean) => void;
  /** Whether the local user has silenced incoming audio (can't hear others) */
  isSilenced: boolean;
  /** Toggle deafen/silence state */
  toggleDeafen: () => void;
  /** Set deafen state directly */
  setSilenced: (silenced: boolean) => void;
  /** IDs of players currently speaking */
  speakingUsers: Set<string>;
  /** All connected remote streams (userId -> stream) */
  remoteStreams: Map<string, MediaStream>;
  /** Error message if voice init failed */
  error: string | null;
  /** True once the manager has been started */
  isReady: boolean;
  /** Reset all peer connections and re-initiate calls */
  resetVoice: () => Promise<void>;
}

export function useVoiceChat(
  currentUserId: string,
): UseVoiceChatReturn {
  const { isMuted, setMuted: setStoreMuted, isSilenced, setSilenced: setStoreSilenced } = useGameStore();
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const managerRef = useRef<VoiceChatManager | null>(null);

  // ── Initialise / teardown manager ───────────────────────

  useEffect(() => {
    console.log(`[useVoiceChat] mounted, userId=${currentUserId}`);
    const manager = new VoiceChatManager(currentUserId, {
      onSpeakingUser: (userId, speaking) => {
        if (speaking) {
          console.log(`[useVoiceChat] speaking: ${userId}`);
        }
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          if (speaking) next.add(userId);
          else next.delete(userId);
          return next;
        });
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      },
      onError: (err) => {
        console.error('[useVoiceChat] manager error:', err.message);
        setError(err.message);
      },
    });

    managerRef.current = manager;
    manager.start().then(() => {
      setIsReady(true);
      console.log('[useVoiceChat] manager started');
    }).catch((err) => {
      console.error('[useVoiceChat] manager.start() failed:', err.message);
    });

    return () => {
      console.log('[useVoiceChat] unmounting');
      manager.stop();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Sync muted state with store ────────────────────────

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.muted = isMuted;
      console.log(`[useVoiceChat] sync muted → ${isMuted} (manager updated, emitting)`);
    }
    socketService.emitMuteChanged(isMuted);
  }, [isMuted]);

  // ── Sync silenced/deafen state with store ─────────────

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.silenced = isSilenced;
      console.log(`[useVoiceChat] sync silenced → ${isSilenced} (manager updated)`);
    }
  }, [isSilenced]);

  // ── Listen for incoming signaling events ──────────────

  useEffect(() => {
    const offOffer = socketService.on('voice:offer', (data: unknown) => {
      const { fromUserId, offer } = data as { fromUserId: string; offer: RTCSessionDescriptionInit };
      console.log(`[useVoiceChat] voice:offer from ${fromUserId}`);
      managerRef.current?.handleOffer(fromUserId, offer).then((answer) => {
        socketService.emitVoiceAnswer(fromUserId, answer);
      });
    });

    const offAnswer = socketService.on('voice:answer', (data: unknown) => {
      const { fromUserId, answer } = data as { fromUserId: string; answer: RTCSessionDescriptionInit };
      console.log(`[useVoiceChat] voice:answer from ${fromUserId}`);
      managerRef.current?.handleAnswer(fromUserId, answer);
    });

    const offIce = socketService.on('voice:ice_candidate', (data: unknown) => {
      const { fromUserId, candidate } = data as { fromUserId: string; candidate: RTCIceCandidateInit };
      managerRef.current?.handleIceCandidate(fromUserId, candidate);
    });

    const offMuteChanged = socketService.on('voice:mute_changed', (data: unknown) => {
      const { userId, muted } = data as { userId: string; muted: boolean };
      console.log(`[useVoiceChat] voice:mute_changed — ${userId} muted=${muted}`);
      // Store mute state of remote users in the player list — consumed by PlayerSeat
      useGameStore.setState((state) => {
        if (!state.currentRoom) return {};
        return {
          currentRoom: {
            ...state.currentRoom,
            players: state.currentRoom.players.map((p) =>
              p.userId === userId ? { ...p, muted: muted ?? false } : p,
            ),
          },
        };
      });
    });

    return () => {
      offOffer();
      offAnswer();
      offIce();
      offMuteChanged();
    };
  }, []);

  // ── Initiate calls when new players join ─────────────

  useEffect(() => {
    if (!isReady) return;
    const offJoined = socketService.on('room:player_joined', (data: unknown) => {
      const { player } = data as { player: PlayerPublic };
      if (player?.userId && player.userId !== currentUserId) {
        console.log(`[useVoiceChat] room:player_joined — initiating call to ${player.userId}`);
        managerRef.current?.initiateCall(player.userId).then((offer) => {
          if (offer) socketService.emitVoiceOffer(player.userId, offer);
        });
      }
    });
    return () => offJoined();
  }, [isReady, currentUserId]);

  // ── Remove peers when players leave ─────────────────

  useEffect(() => {
    const offLeft = socketService.on('room:player_left', (data: unknown) => {
      const { userId } = data as { userId: string };
      console.log(`[useVoiceChat] room:player_left — ${userId}`);
      managerRef.current?.removePeer(userId);
    });
    return () => offLeft();
  }, []);

  // ── Actions ─────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    console.log(`[useVoiceChat] toggleMute: ${isMuted} → ${next}`);
    setStoreMuted(next);
  }, [isMuted, setStoreMuted]);

  const setMutedFn = useCallback((muted: boolean) => {
    console.log(`[useVoiceChat] setMute: ${muted}`);
    setStoreMuted(muted);
  }, [setStoreMuted]);

  const toggleDeafen = useCallback(() => {
    const next = !isSilenced;
    console.log(`[useVoiceChat] toggleDeafen: ${isSilenced} → ${next}`);
    setStoreSilenced(next);
  }, [isSilenced, setStoreSilenced]);

  const setSilencedFn = useCallback((silenced: boolean) => {
    console.log(`[useVoiceChat] setSilenced: ${silenced}`);
    setStoreSilenced(silenced);
  }, [setStoreSilenced]);

  const resetVoice = useCallback(async () => {
    console.log('[useVoiceChat] resetVoice');
    await managerRef.current?.resetVoice();
  }, []);

  return {
    isMuted,
    toggleMute,
    setMuted: setMutedFn,
    isSilenced,
    toggleDeafen,
    setSilenced: setSilencedFn,
    speakingUsers,
    error,
    isReady,
    resetVoice,
  };
}
