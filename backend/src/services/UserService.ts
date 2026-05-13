import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { User, JwtPayload } from '../types/index.js';

// In-memory store for MVP (replace with MySQL in production)
const users: Map<string, User> = new Map();
const usernameIndex: Map<string, string> = new Map(); // username -> userId

export class UserService {
  private jwtSecret: string;

  constructor(jwtSecret: string) {
    this.jwtSecret = jwtSecret;
  }

  async register(username: string, password: string): Promise<{ success: boolean; token?: string; user?: Omit<User, 'passwordHash'>; error?: string }> {
    console.debug(`[UserService] Register attempt: ${username}`);
    if (!username || username.length < 2 || username.length > 20) {
      console.debug(`[UserService] Register failed: invalid username length`);
      return { success: false, error: '用户名需要2-20个字符' };
    }
    if (!password || password.length < 6) {
      console.debug(`[UserService] Register failed: password too short`);
      return { success: false, error: '密码至少需要6个字符' };
    }
    if (usernameIndex.has(username.toLowerCase())) {
      console.debug(`[UserService] Register failed: username taken`);
      return { success: false, error: '用户名已被占用' };
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = {
      id,
      username,
      passwordHash,
      chips: 500, // Starting chips
      createdAt: new Date(),
    };

    users.set(id, user);
    usernameIndex.set(username.toLowerCase(), id);

    const token = this.generateToken(user);
    const { passwordHash: _, ...publicUser } = user;
    console.debug(`[UserService] Register success: ${username} (${id}), chips: ${user.chips}`);
    return { success: true, token, user: publicUser };
  }

  async login(username: string, password: string): Promise<{ success: boolean; token?: string; user?: Omit<User, 'passwordHash'>; error?: string }> {
    console.debug(`[UserService] Login attempt: ${username}`);
    const userId = usernameIndex.get(username.toLowerCase());
    if (!userId) {
      console.debug(`[UserService] Login failed: user not found`);
      return { success: false, error: '用户名或密码错误' };
    }
    const user = users.get(userId)!;
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      console.debug(`[UserService] Login failed: wrong password`);
      return { success: false, error: '用户名或密码错误' };
    }

    const token = this.generateToken(user);
    const { passwordHash: _, ...publicUser } = user;
    console.debug(`[UserService] Login success: ${username} (${user.id}), chips: ${user.chips}`);
    return { success: true, token, user: publicUser };
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
      console.debug(`[UserService] Token verified: ${payload.userId}`);
      return payload;
    } catch (err) {
      console.debug(`[UserService] Token verify failed: ${(err as Error).message}`);
      return null;
    }
  }

  getUser(userId: string): Omit<User, 'passwordHash'> | null {
    const user = users.get(userId);
    if (!user) {
      console.debug(`[UserService] getUser: not found ${userId}`);
      return null;
    }
    const { passwordHash: _, ...pub } = user;
    console.debug(`[UserService] getUser: ${user.username} (${userId}), chips: ${user.chips}`);
    return pub;
  }

  updateChips(userId: string, amount: number): void {
    const user = users.get(userId);
    if (user) {
      const oldChips = user.chips;
      user.chips = Math.max(0, user.chips + amount);
      console.debug(`[UserService] updateChips: ${user.username} (${userId}), ${oldChips} -> ${user.chips} (delta: ${amount})`);
    } else {
      console.debug(`[UserService] updateChips: user not found ${userId}`);
    }
  }

  setChips(userId: string, amount: number): void {
    const user = users.get(userId);
    if (user) {
      const oldChips = user.chips;
      user.chips = Math.max(0, amount);
      console.debug(`[UserService] setChips: ${user.username} (${userId}), ${oldChips} -> ${user.chips}`);
    } else {
      console.debug(`[UserService] setChips: user not found ${userId}`);
    }
  }

  getChips(userId: string): number {
    const chips = users.get(userId)?.chips ?? 0;
    console.debug(`[UserService] getChips: ${userId} -> ${chips}`);
    return chips;
  }

  resetChips(userId: string): number {
    const user = users.get(userId);
    if (user) {
      const oldChips = user.chips;
      user.chips = 500;
      console.debug(`[UserService] resetChips: ${user.username} (${userId}), ${oldChips} -> 500`);
      return user.chips;
    }
    console.debug(`[UserService] resetChips: user not found ${userId}`);
    return 0;
  }

  private generateToken(user: User): string {
    return jwt.sign({ userId: user.id, username: user.username }, this.jwtSecret, { expiresIn: '7d' });
  }
}
