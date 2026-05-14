import { Server, Socket } from 'socket.io';
import type { HandAction, PublicRoomState } from '../types/index.js';
import { RoomManager } from '../room/RoomManager.js';
import { UserService } from '../services/UserService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

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

  // ── Disconnect ───────────────────────────────────────

  socket.on('disconnect', () => {
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
