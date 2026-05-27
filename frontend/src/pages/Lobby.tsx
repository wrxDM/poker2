import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { logger } from '../utils/logger';
import type { User } from '../types';

interface RoomListItem {
  roomId: string;
  name: string;
  blindSmall: number;
  blindBig: number;
  playerCount: number;
  status: string;
}

export function Lobby() {
  const navigate = useNavigate();
  const { user, token, setRoom, setChips, setUser } = useGameStore();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [blindSmall, setBlindSmall] = useState(10);
  const [blindBig, setBlindBig] = useState(20);

  const syncUserInfo = useCallback(async () => {
    try {
      const userInfo = await socketService.getUserInfo();
      setUser(userInfo as User, token);
    } catch (err) {
      logger.error('Lobby', `Sync user info failed: ${(err as Error).message}`);
    }
  }, [token, setUser]);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    syncUserInfo();
    loadRooms();
    const interval = setInterval(loadRooms, 3000);
    return () => clearInterval(interval);
  }, [token, navigate, syncUserInfo]);

  const loadRooms = useCallback(async () => {
    try {
      const roomList = await socketService.listRooms();
      setRooms(roomList as RoomListItem[]);
    } catch {
      // ignore
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const room = await socketService.createRoom({
        name: createName || `${user?.username}的房间`,
        blindSmall,
        blindBig,
      });
      setRoom(room);
      navigate('/game');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [createName, blindSmall, blindBig, user, setRoom, navigate]);

  const handleJoinRoom = useCallback(async (roomId: string) => {
    setLoading(true);
    setError('');
    try {
      const room = await socketService.joinRoom(roomId, user?.chips ?? 500);
      setRoom(room);
      navigate('/game');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, setRoom, navigate]);

  const handleJoinById = useCallback(async () => {
    if (!joinRoomId.trim()) return;
    await handleJoinRoom(joinRoomId.trim());
  }, [joinRoomId, handleJoinRoom]);

  const handleResetChips = useCallback(async () => {
    try {
      const result = await socketService.resetChips();
      setChips(result.chips);
    } catch (err) {
      logger.error('Lobby', `Reset chips failed: ${(err as Error).message}`);
    }
  }, [setChips]);

  if (!user) return null;

  return (
    <div className="h-screen h-dvh bg-gradient-to-b from-gray-900 to-black text-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-yellow-400">🎰 德州扑克</h1>
          <p className="text-white/50 text-xs sm:text-sm">多人在线</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleResetChips}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs sm:text-sm rounded-lg font-bold transition-colors"
          >
            重置筹码
          </button>
          <div className="text-right">
            <div className="text-white font-bold text-sm sm:text-base">{user.username}</div>
            <div className="text-yellow-400 text-xs sm:text-sm">💰 {(user.chips ?? 0).toLocaleString()} 筹码</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 sm:p-6 overflow-auto max-w-3xl mx-auto w-full space-y-4 sm:space-y-6">
        {/* Create Room */}
        <section className="bg-white/5 rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">🎮 创建房间</h2>
          {showCreate ? (
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-1">房间名（可选）</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={`${user?.username ?? '我的'}的房间`}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-sm mb-1">小盲</label>
                  <input
                    type="number"
                    value={blindSmall}
                    onChange={(e) => setBlindSmall(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">大盲</label>
                  <input
                    type="number"
                    value={blindBig}
                    onChange={(e) => setBlindBig(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateRoom}
                  disabled={loading}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {loading ? '创建中...' : '创建房间'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors"
            >
              + 创建新房间
            </button>
          )}
        </section>

        {/* Join by ID */}
        <section className="bg-white/5 rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">🔗 加入房间</h2>
          <div className="flex gap-3">
            <input
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="输入房间号"
              onKeyDown={(e) => e.key === 'Enter' && handleJoinById()}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-yellow-500 font-mono tracking-widest"
            />
            <button
              onClick={handleJoinById}
              disabled={loading || !joinRoomId.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              加入
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </section>

        {/* Room List */}
        <section className="bg-white/5 rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">🛋️ 可用房间</h2>
            <button
              onClick={loadRooms}
              className="text-white/40 hover:text-white text-sm transition-colors"
            >
              刷新
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🛋️</div>
              <p className="text-white/50">暂无可用房间</p>
              <p className="text-white/30 text-sm">创建一个房间开始游戏吧</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.roomId}
                  className="flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors cursor-pointer"
                  onClick={() => handleJoinRoom(room.roomId)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-white font-bold">{room.name}</div>
                      <div className="text-white/40 text-xs">
                        {room.blindSmall}/{room.blindBig}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            room.status === 'waiting'
                              ? 'bg-green-500/20 text-green-400'
                              : room.status === 'playing'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {room.status === 'waiting' ? '等待中' : room.status === 'playing' ? '进行中' : room.status}
                        </span>
                        <span className="text-white/40 text-xs">
                          👥 {room.playerCount}人
                        </span>
                      </div>
                      <div className="text-yellow-400 font-bold text-sm font-mono">
                        #{room.roomId}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
