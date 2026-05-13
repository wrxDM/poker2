import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { UserService } from './services/UserService.js';
import { RoomManager } from './room/RoomManager.js';
import { setupSocketHandlers } from './socket/handlers.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'poker-secret';

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

const userService = new UserService(JWT_SECRET);

const roomManager = new RoomManager(
  (roomId, event, data) => {
    const io = (global as unknown as { io: Server }).io;
    io.to(roomId).emit(event, { roomId, ...data as object });
  },
  userService,
);

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
(global as unknown as { io: Server }).io = io;

setupSocketHandlers(io, roomManager, userService);

// ── REST API ─────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  const result = await userService.register(username, password);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await userService.login(username, password);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '未提供 Token' });
    return;
  }
  const user = userService.verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Token 无效' });
    return;
  }
  const fullUser = userService.getUser(user.userId);
  if (!fullUser) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({ user: fullUser });
});

app.get('/api/rooms', (_, res) => {
  const rooms = roomManager.getAllRooms();
  res.json({ rooms });
});

httpServer.listen(PORT, () => {
  console.log(`🎰 Poker server running on http://localhost:${PORT}`);
});
