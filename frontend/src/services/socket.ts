import { io, Socket } from 'socket.io-client';
import { logger } from '../utils/logger';
import type { PublicRoomState, HandAction } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private _roomId: string | null = null;

  get roomId(): string | null {
    return this._roomId;
  }

  setRoomId(roomId: string | null): void {
    this._roomId = roomId;
  }

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io('/', {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      this.socket.on('connect', () => {
        logger.info('Socket', 'Connected');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        logger.error('Socket', `Connect error: ${err.message}`);
        reject(err);
      });

      // Forward all events to registered listeners
      const events = [
        'room:state', 'room:player_joined', 'room:player_left',
        'game:started', 'game:showdown', 'game:ended',
        'hand:dealt', 'player:actioned', 'round:started',
        'voice:user_joined', 'voice:user_left',
        'voice:offer', 'voice:answer', 'voice:ice_candidate',
        'voice:mute_changed', 'voice:peers',
      ];

      for (const event of events) {
        this.socket.on(event, (data: unknown) => {
          this.emit(event, data);
        });
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, cb: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  // ── Room Actions ──────────────────────────────────────

  async createRoom(params: { name: string; blindSmall?: number; blindBig?: number }): Promise<PublicRoomState> {
    const room = await this.ack<PublicRoomState>('room:create', params);
    this._roomId = room.roomId;
    return room;
  }

  async joinRoom(roomId: string, chips?: number): Promise<PublicRoomState> {
    this._roomId = roomId;
    return this.ack('room:join', { roomId, chips });
  }

  async leaveRoom(): Promise<void> {
    this._roomId = null;
    await this.ack('room:leave', {});
  }

  async resetChips(): Promise<{ chips: number }> {
    return this.ack('user:reset_chips', {});
  }

  async getUserInfo(): Promise<Omit<import('../types').User, 'passwordHash'>> {
    return this.ack('user:info', {});
  }

  async listRooms(): Promise<{ roomId: string; name: string; blindSmall: number; blindBig: number; playerCount: number; status: string }[]> {
    return this.ack('room:list', {});
  }

  async getMyHand(): Promise<{ cards: unknown[] }> {
    return this.ack('player:hand', {});
  }

  async startGame(): Promise<void> {
    await this.ack('game:start', {});
  }

  async startNextHand(): Promise<void> {
    await this.ack('game:next_hand', {});
  }

  async takeAction(action: HandAction, amount?: number): Promise<void> {
    await this.ack('player:action', { action, amount });
  }

  // ── Bot Actions ───────────────────────────────────────

  async addBot(params?: { chips?: number; playStyle?: 'tight' | 'loose' | 'aggressive' | 'passive' }): Promise<{ botId: string; username: string }> {
    return this.ack('bot:add', params || {});
  }

  async removeBot(botId: string): Promise<void> {
    await this.ack('bot:remove', { botId });
  }

  // ── Voice Chat Signaling ────────────────────────────────

  /** Broadcast WebRTC offer to a specific peer */
  emitVoiceOffer(toUserId: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('voice:offer', { toUserId, offer });
  }

  /** Send WebRTC answer back to the caller */
  emitVoiceAnswer(toUserId: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('voice:answer', { toUserId, answer });
  }

  /** Send ICE candidate to a specific peer */
  emitVoiceIceCandidate(toUserId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('voice:ice_candidate', { toUserId, candidate });
  }

  /** Broadcast mute state change to all players in the room */
  emitMuteChanged(muted: boolean): void {
    this.socket?.emit('voice:mute_changed', { muted });
  }

  /** Request to re-join voice (re-initiate peer connections) */
  async requestVoicePeers(): Promise<{ peers: { userId: string; username: string }[] }> {
    return this.ack('voice:request_peers', {});
  }

  private ack<T>(event: string, data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      this.socket.emit(event, data, (response: unknown) => {
        const res = response as { success: boolean; room?: PublicRoomState; rooms?: unknown[]; user?: unknown; error?: string };
        if (res.success) {
          resolve((res.room ?? res.rooms ?? res.user ?? res) as T);
        } else {
          reject(new Error(res.error || 'Unknown error'));
        }
      });
    });
  }
}

export const socketService = new SocketService();
