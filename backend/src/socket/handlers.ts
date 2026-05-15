import { Server, Socket } from 'socket.io';
import type { HandAction, PublicRoomState } from '../types/index.js';
import { RoomManager } from '../room/RoomManager.js';
import { UserService } from '../services/UserService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

/** Map of userId -> their current socket ID, used for precise WebRTC signaling routing */
const userSocketMap = new Map<string, string>();

export function setupSocketHandlers(io: Server, roomManager: RoomManager, userService: UserService): void {
  // Auth middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('未登录'));
    }
    const payload = userService.verifyToken(token as string);
    if (!payload) {
      return next(new Error('Token 无效'));
    }
    socket.userId = payload.userId;
    socket.username = payload.username;
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username!;

    // Register socket ID for this user so we can route WebRTC signals precisely
    userSocketMap.set(userId, socket.id);
    console.log(`[Socket] ${username} (${userId}) connected, socketId=${socket.id}`);

    // ── Room Events ──────────────────────────────────────

    socket.on('room:create', (params: { name: string; blindSmall?: number; blindBig?: number }, ack) => {
      const engine = roomManager.createRoom({
        name: params.name || `${username}的房间`,
        blindSmall: params.blindSmall,
        blindBig: params.blindBig,
        creatorId: userId,
        creatorUsername: username,
        creatorChips: userService.getChips(userId),
      });
      const state = engine.getPublicState();
      socket.join(state.roomId);
      ack({ success: true, room: state });
    });

    socket.on('room:list', (_, ack) => {
      const rooms = roomManager.getAllRooms();
      ack({ success: true, rooms });
    });

    socket.on('room:join', (params: { roomId: string; chips?: number }, ack) => {
      const chips = params.chips ?? userService.getChips(userId);
      const result = roomManager.joinRoom(
        params.roomId,
        userId,
        username,
        chips,
      );
      if (!result.success) {
        ack({ success: false, error: result.error });
        return;
      }
      const state = result.engine!.getPublicState();
      socket.join(state.roomId);
      // Notify others
      socket.to(state.roomId).emit('room:player_joined', {
        player: state.players.find(p => p.userId === userId),
      });
      ack({ success: true, room: state });
    });

    socket.on('room:leave', (_, ack) => {
      leaveCurrentRoom(socket, roomManager, io);
      ack({ success: true });
    });

    socket.on('room:state', (params: { roomId: string }, ack) => {
      const engine = roomManager.getRoom(params.roomId);
      if (!engine) {
        ack({ success: false, error: '房间不存在' });
        return;
      }
      ack({ success: true, room: engine.getPublicState() });
    });

    socket.on('player:hand', (_, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      const cards = engine.getPlayerHand(userId);
      ack({ success: true, cards: cards ?? [] });
    });

    // ── Game Events ──────────────────────────────────────

    socket.on('game:start', (_, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      const result = engine.startGame();
      if (!result.success) {
        ack({ success: false, error: result.error });
        return;
      }
      io.to(engine.getRoom().roomId).emit('game:started', { roomId: engine.getRoom().roomId });
      ack({ success: true });
    });

    socket.on('game:next_hand', (_, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      const result = engine.startNextHand();
      if (!result.success) {
        ack({ success: false, error: result.error });
        return;
      }
      ack({ success: true });
    });

    socket.on('player:action', (params: {
      action: HandAction;
      amount?: number;
    }, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      const result = engine.handleAction(userId, params.action, params.amount);
      if (!result.success) {
        ack({ success: false, error: result.error });
        return;
      }
      ack({ success: true });
    });

    // ── Bot Events ───────────────────────────────────────────

    socket.on('bot:add', (params: {
      chips?: number;
      playStyle?: 'tight' | 'loose' | 'aggressive' | 'passive';
    }, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      const botId = engine.addBot(params.chips || 500, params.playStyle);
      const bot = engine.getBot(botId);
      ack({ success: true, botId, username: bot?.username });
    });

    socket.on('bot:remove', (params: { botId: string }, ack) => {
      const engine = roomManager.getRoomByUser(userId);
      if (!engine) {
        ack({ success: false, error: '你不在任何房间中' });
        return;
      }
      engine.removeBot(params.botId);
      ack({ success: true });
    });

  // ── User Events ─────────────────────────────────────────

  socket.on('user:reset_chips', (_, ack) => {
    const chips = userService.resetChips(userId);
    const user = userService.getUser(userId);
    ack({ success: true, chips, user });
  });

  socket.on('user:info', (_, ack) => {
    const user = userService.getUser(userId);
    if (!user) {
      ack({ success: false, error: 'User not found' });
      return;
    }
    ack({ success: true, user });
  });

  // ── Voice Chat Signaling ────────────────────────────────

  /**
   * Relay a WebRTC offer to a specific peer.
   * Payload: { toUserId: string, offer: RTCSessionDescriptionInit }
   */
  socket.on('voice:offer', (data: { toUserId: string; offer: unknown }, ack) => {
    const { toUserId, offer } = data;
    const room = roomManager.getRoomByUser(userId);
    if (!room) return;

    // Validate that the target peer is in the same room
    const targetPlayer = room.getRoom().players.find((p) => p.userId === toUserId);
    if (!targetPlayer) {
      console.warn(`[VoiceChat] voice:offer — target ${toUserId} not in room ${room.getRoom().roomId}`);
      return;
    }

    const targetSocketId = userSocketMap.get(toUserId);
    if (!targetSocketId) {
      console.warn(`[VoiceChat] voice:offer — target ${toUserId} has no active socket`);
      return;
    }

    io.to(targetSocketId).emit('voice:offer', { fromUserId: userId, offer });
  });

  /**
   * Relay a WebRTC answer to the caller.
   * Payload: { toUserId: string, answer: RTCSessionDescriptionInit }
   */
  socket.on('voice:answer', (data: { toUserId: string; answer: unknown }, ack) => {
    const { toUserId, answer } = data;
    const room = roomManager.getRoomByUser(userId);
    if (!room) {
      console.warn(`[VoiceChat] voice:answer — sender ${userId} not in any room`);
      return;
    }

    // Validate that the target peer is in the same room
    const targetPlayer = room.getRoom().players.find((p) => p.userId === toUserId);
    if (!targetPlayer) {
      console.warn(`[VoiceChat] voice:answer — target ${toUserId} not in room ${room.getRoom().roomId}`);
      return;
    }

    const targetSocketId = userSocketMap.get(toUserId);
    if (!targetSocketId) {
      console.warn(`[VoiceChat] voice:answer — target ${toUserId} has no active socket`);
      return;
    }

    io.to(targetSocketId).emit('voice:answer', { fromUserId: userId, answer });
  });

  /**
   * Relay an ICE candidate to a specific peer.
   * Payload: { toUserId: string, candidate: unknown }
   */
  socket.on('voice:ice_candidate', (data: { toUserId: string; candidate: unknown }, ack) => {
    const { toUserId, candidate } = data;
    const room = roomManager.getRoomByUser(userId);
    if (!room) {
      console.warn(`[VoiceChat] voice:ice_candidate — sender ${userId} not in any room`);
      return;
    }

    // Validate that the target peer is in the same room
    const targetPlayer = room.getRoom().players.find((p) => p.userId === toUserId);
    if (!targetPlayer) {
      console.warn(`[VoiceChat] voice:ice_candidate — target ${toUserId} not in room ${room.getRoom().roomId}`);
      return;
    }

    const targetSocketId = userSocketMap.get(toUserId);
    if (!targetSocketId) {
      console.warn(`[VoiceChat] voice:ice_candidate — target ${toUserId} has no active socket`);
      return;
    }

    io.to(targetSocketId).emit('voice:ice_candidate', { fromUserId: userId, candidate });
  });

  /**
   * Broadcast mute state change to all other players in the room.
   * Payload: { muted: boolean }
   */
  socket.on('voice:mute_changed', (data: { muted: boolean }) => {
    const { muted } = data;
    const room = roomManager.getRoomByUser(userId);
    if (!room) return;
    socket.to(room.getRoom().roomId).emit('voice:mute_changed', { userId, muted });
  });

  /**
   * Respond with the list of other user IDs in the same room (for re-establishing peers).
   */
  socket.on('voice:request_peers', (_, ack) => {
    const room = roomManager.getRoomByUser(userId);
    if (!room) {
      ack({ success: false, error: 'Not in a room' });
      return;
    }
    const peers = room.getRoom().players
      .filter((p) => p.userId !== userId)
      .map((p) => ({ userId: p.userId, username: p.username }));
    ack({ success: true, peers });
  });

  // ── Disconnect ───────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[Socket] ${username} (${userId}) disconnected, socketId=${socket.id}`);
    userSocketMap.delete(userId);
    leaveCurrentRoom(socket, roomManager, io);
  });
  });
}

function leaveCurrentRoom(socket: AuthenticatedSocket, roomManager: RoomManager, io: Server): void {
  const userId = socket.userId;
  if (!userId) return;

  const engine = roomManager.getRoomByUser(userId);
  if (!engine) return;

  const state = engine.getRoom();
  socket.leave(state.roomId);
  roomManager.leaveRoom(userId);

  const remaining = roomManager.getRoom(state.roomId);
  if (remaining) {
    io.to(state.roomId).emit('room:player_left', { userId });
    io.to(state.roomId).emit('room:state', remaining.getPublicState());
  }
}
