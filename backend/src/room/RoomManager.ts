import { v4 as uuidv4 } from 'uuid';
import type { PublicRoomState, RoomState } from '../types/index.js';
import { GameEngine } from '../game/GameEngine.js';
import { UserService } from '../services/UserService.js';

type GameEventCallback = (roomId: string, event: string, data: unknown) => void;

export class RoomManager {
  private rooms: Map<string, GameEngine> = new Map();
  private userToRoom: Map<string, string> = new Map(); // userId -> roomId
  private onGameEvent: GameEventCallback;
  private userService: UserService;

  constructor(onGameEvent: GameEventCallback, userService: UserService) {
    this.onGameEvent = onGameEvent;
    this.userService = userService;
  }

  createRoom(params: {
    name: string;
    blindSmall?: number;
    blindBig?: number;
    creatorId: string;
    creatorUsername: string;
    creatorChips?: number;
  }): GameEngine {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const engine = new GameEngine({
      roomId,
      name: params.name,
      blindSmall: params.blindSmall ?? 10,
      blindBig: params.blindBig ?? 20,
      onEvent: (event, data) => this.onGameEvent(roomId, event, data),
      userService: this.userService,
    });

    engine.addPlayer(params.creatorId, params.creatorUsername, params.creatorChips ?? 500);
    this.rooms.set(roomId, engine);
    this.userToRoom.set(params.creatorId, roomId);

    return engine;
  }

  getRoom(roomId: string): GameEngine | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByUser(userId: string): GameEngine | undefined {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  joinRoom(roomId: string, userId: string, username: string, chips: number): { success: boolean; engine?: GameEngine; error?: string } {
    const engine = this.rooms.get(roomId.toUpperCase());
    if (!engine) return { success: false, error: '房间不存在' };

    const existingPlayer = engine.getPlayer(userId);
    if (existingPlayer) {
      return { success: true, engine };
    }

    const state = engine.getRoom();
    if (state.status !== 'waiting') {
      return { success: false, error: '游戏已开始，无法加入' };
    }

    engine.addPlayer(userId, username, chips);
    this.userToRoom.set(userId, state.roomId);
    return { success: true, engine };
  }

  leaveRoom(userId: string): void {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;

    const engine = this.rooms.get(roomId);
    if (engine) {
      engine.removePlayer(userId);
      // Clean up empty rooms
      if (engine.getRoom().players.length === 0) {
        this.rooms.delete(roomId);
      }
    }
    this.userToRoom.delete(userId);
  }

  getAllRooms(): PublicRoomState[] {
    return [...this.rooms.values()]
      .map(e => e.getPublicState());
      // .filter(r => r.status === 'waiting');
  }

  destroyRoom(roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (engine) {
      for (const p of engine.getRoom().players) {
        this.userToRoom.delete(p.userId);
      }
      this.rooms.delete(roomId);
    }
  }
}
