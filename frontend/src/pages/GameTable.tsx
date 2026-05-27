import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { logger } from '../utils/logger';
import { CommunityCards } from '../components/CommunityCards';
import { PlayerSeat } from '../components/PlayerSeat';
import { PotDisplay } from '../components/PotDisplay';
import { ActionBar } from '../components/ActionBar';
import { ShowdownModal } from '../components/ShowdownModal';
import { Card } from '../components/Card';
import { VoiceControls } from '../components/VoiceControls';
import { useVoiceChat } from '../hooks/useVoiceChat';
import type { PublicRoomState, HandInfo, HandAction, ShowdownInfo } from '../types';

const SEAT_POSITIONS = [
  { bottom: '5%', left: '50%', transform: 'translateX(-50%)' },   // 0 - bottom center (self)
  { bottom: '18%', left: '20%' },                                      // 1 - bottom left
  { bottom: '38%', left: '5%' },                                       // 2 - mid left
  { bottom: '58%', left: '5%' },                                       // 3 - top left
  { top: '10%', left: '20%' },                                        // 4 - top left corner
  { top: '5%', left: '50%', transform: 'translateX(-50%)' },          // 5 - top center
  { top: '10%', right: '20%' },                                        // 6 - top right corner
  { bottom: '58%', right: '5%' },                                       // 7 - top right
  { bottom: '38%', right: '5%' },                                      // 8 - mid right
  { bottom: '18%', right: '20%' },                                     // 9 - bottom right
];

// 根据 SEAT_POSITIONS 动态计算玩家位置：mySeat 永远在 SEAT_POSITIONS[0]（底部中心）
const getUniformPosition = (playerSeat: number, mySeat: number, totalPlayers: number) => {
  // 计算旋转偏移量，使 mySeat 位于 SEAT_POSITIONS[0]
  playerSeat = (playerSeat - mySeat + totalPlayers) % totalPlayers;
  const gap = 10 / totalPlayers;
  let index = Math.floor(playerSeat * gap);
  if (playerSeat > totalPlayers / 2) {
    index = 10 - Math.floor((totalPlayers - playerSeat) * gap);
  }
  // console.log('[DEBUG] totalPlayers:', totalPlayers);
  // console.log('[DEBUG] playerSeat:', playerSeat);
  // console.log('[DEBUG] gap:', gap);
  // console.log('[DEBUG] SEAT_POSITIONS[Math.floor(playerSeat * gap)]:', SEAT_POSITIONS[Math.floor(playerSeat * gap)]);
  return SEAT_POSITIONS[index];
};

export function GameTable() {
  const navigate = useNavigate();
  const { user, token, currentRoom, myHand, showdown, setRoom, setMyHand, setShowdown, clearRoom } = useGameStore();
  const [timerSeconds, setTimerSeconds] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Voice Chat ─────────────────────────────────────────
  const { toggleMute, toggleDeafen, speakingUsers, error: voiceError, resetVoice } = useVoiceChat(
    user?.id ?? '',
  );

  // ── Turn Timer ───────────────────────────────────────────
  const activeRounds = ['preflop', 'flop', 'turn', 'river'] as const;

  useEffect(() => {
    const { currentTurn, round } = currentRoom ?? {};
    const myPlayer = currentRoom?.players.find(p => p.userId === user?.id);
    const isMyTurn = myPlayer?.seat === currentTurn;

    if (!currentRoom || !user) return;

    if (isMyTurn && activeRounds.includes(round as typeof activeRounds[number])) {
      // Start / reset timer
      setTimerSeconds(30);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            socketService.takeAction('fold').catch(() => {});
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Not my turn — clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimerSeconds(30);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentRoom?.currentTurn, currentRoom?.round, user]);

  useEffect(() => {
    if (!token || !user) {
      navigate('/');
      return;
    }

    // Listen for room state updates
    const offState = socketService.on('room:state', (data: unknown) => {
      const d = data as { roomId: string; } & PublicRoomState;
      logger.debug('GameTable', '[DEBUG] room:state received', { roomId: d.roomId, currentRoomId: currentRoom?.roomId });
      if (d.roomId === currentRoom?.roomId || !currentRoom) {
        logger.debug('GameTable', '[DEBUG] setRoom called, myHand BEFORE:', useGameStore.getState().myHand);
        setRoom(d as PublicRoomState);
        // Actively fetch my hand after room state updates
        socketService.getMyHand().then(res => {
          if ((res.cards as unknown[]).length > 0) {
            setMyHand({ cards: res.cards as HandInfo['cards'] });
            logger.debug('GameTable', '[DEBUG] getMyHand set, myHand now:', useGameStore.getState().myHand);
          }
        }).catch(() => {});
        logger.debug('GameTable', '[DEBUG] setRoom done, myHand AFTER:', useGameStore.getState().myHand);
      }
    });

    // Listen for showdown
    const offShowdown = socketService.on('game:showdown', (data: unknown) => {
      const d = data as { roomId: string } & ShowdownInfo;
      logger.debug('GameTable', '[DEBUG] game:showdown received', d);
      setShowdown(d);
    });

    // Listen for game ended
    const offEnd = socketService.on('game:ended', (_data: unknown) => {
      logger.debug('GameTable', '[DEBUG] game:ended received');
    });

    return () => {
      offState();
      offShowdown();
      offEnd();
    };
  }, [token, user, navigate, currentRoom, setRoom, setMyHand, setShowdown]);

  const handleAction = useCallback(async (action: HandAction, amount?: number) => {
    try {
      await socketService.takeAction(action, amount);
    } catch (err) {
      logger.error('GameTable', `Action failed: ${(err as Error).message}`);
    }
  }, []);

  const handleLeave = useCallback(async () => {
    await socketService.leaveRoom();
    clearRoom();
    navigate('/lobby');
  }, [clearRoom, navigate]);

  const handleStartGame = useCallback(async () => {
    try {
      await socketService.startGame();
    } catch (err) {
      logger.error('GameTable', `Start game failed: ${(err as Error).message}`);
    }
  }, []);

  const handleStartNextHand = useCallback(async () => {
    try {
      await socketService.startNextHand();
    } catch (err) {
      logger.error('GameTable', `Start next hand failed: ${(err as Error).message}`);
    }
  }, []);

  const handleCloseShowdown = useCallback(() => {
    useGameStore.getState().clearShowdown();
  }, []);

  const handleAddBot = useCallback(async () => {
    const styles: ('tight' | 'loose' | 'aggressive' | 'passive')[] = ['tight', 'loose', 'aggressive', 'passive'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    try {
      await socketService.addBot({ chips: 500, playStyle: randomStyle });
    } catch (err) {
      logger.error('GameTable', `Add bot failed: ${(err as Error).message}`);
    }
  }, []);

  if (!currentRoom) {
    return (
      <div className="h-full flex items-center justify-center bg-black/80">
        <div className="text-white text-center">
          <div className="text-4xl mb-4">🎰</div>
          <p>加载房间中...</p>
        </div>
      </div>
    );
  }

  const { currentTurn, dealerSeat, players, communityCards, pot, sidePots, round, blindSmall, blindBig } = currentRoom;
  const myPlayer = players.find(p => p.userId === user?.id);
  const isMyTurn = myPlayer?.seat === currentTurn;

  const isWaiting = currentRoom.status === 'waiting';
  const isPlaying = currentRoom.status === 'playing';
  const canCheck = isMyTurn && myPlayer && !myPlayer.folded && !myPlayer.allin && (currentRoom.currentBet === myPlayer.bet);
  const toCall = myPlayer ?  currentRoom.currentBet - myPlayer.bet : 0;
  const canCall = isMyTurn && toCall > 0  && toCall < myPlayer?.chips && myPlayer && !myPlayer.folded && !myPlayer.allin;
  const canRaise = isMyTurn && myPlayer?.minRaise < myPlayer?.chips && myPlayer && !myPlayer.folded && !myPlayer.allin;

  // 动态计算均匀分布的位置
  const getPosition = (playerSeat: number) => {
    return getUniformPosition(playerSeat, myPlayer?.seat ?? 0, players.length);
  };

  return (
    <div className="h-dvh flex flex-col bg-black" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeave}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            ← 离开
          </button>
          <div className="text-white font-bold">
            🏠 {currentRoom.name}
          </div>
          <div className="text-white/50 text-sm">
            {blindSmall}/{blindBig}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm font-bold">
            💰 {(myPlayer?.chips ?? user?.chips ?? 0).toLocaleString()} 筹码
          </span>
        </div>
      </div>

      {/* Game Table */}
      <div className="table-felt relative overflow-hidden" style={{ gridRow: '2/3' }}>
        {/* Decorative chip pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
        </div>

        {/* Scaled table area */}
        <div className="table-scaler absolute inset-0 flex flex-col gap-6">
          {/* ── Top: Player Seats ── */}
          <div className="relative flex-1">
            {/* Pot — centered in seats area */}
            <div className="absolute inset-0 flex items-center justify-center pt-0 z-10 pointer-events-none">
              <PotDisplay pot={pot} sidePots={sidePots} />
            </div>

            {/* Player Seats */}
            {players.map((player) => (
              <PlayerSeat
                key={player.userId}
                player={player}
                isCurrentTurn={player.seat === currentTurn}
                isDealer={player.seat === dealerSeat}
                isSmallBlind={player.seat === currentRoom.smallBlindSeat}
                isBigBlind={player.seat === currentRoom.bigBlindSeat}
                isMySeat={player.userId === user?.id}
                isSpeaking={speakingUsers.has(player.userId)}
                position={getPosition(player.seat)}
              />
            ))}
          </div>

          {/* ── Middle: Community Cards ── */}
          <div className="relative flex items-center justify-center z-10">
            <CommunityCards cards={communityCards} round={round} />
          </div>

          {/* ── Bottom: My Hand ── */}
          <div className="relative flex items-end justify-center pb-3 z-20">
            {myHand && round !== 'waiting' && (
              <div className="flex gap-1">
                {myHand.cards.map((card, i) => (
                  <Card key={i} card={card} delay={i * 100} />
                ))}
              </div>
            )}
          </div>

          {/* Start game button */}
          {isWaiting && myPlayer && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-30">
              <div className="flex flex-col items-center gap-2">
                <p className="text-white text-xl font-bold mb-4">
                  等待玩家入座... ({players.length} 人)
                </p>
                {/* Add bot button */}
                <button
                  onClick={handleAddBot}
                  className="w-48 px-4 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95"
                >
                  🤖 添加机器人
                </button>
                {players.length >= 2 && (
                  <button
                    onClick={handleStartGame}
                    className="w-48 px-4 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95"
                  >
                    🎮 开始游戏
                  </button>
                )}
                {players.length < 2 && (
                  <p className="text-white/60 text-sm">至少需要 2 名玩家才能开始</p>
                )}
              </div>
            </div>
          )}

          {/* Next hand button (after game finished) */}
          {currentRoom.status === 'finished' && round === 'finished' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-30">
              <div className="text-center">
                <p className="text-white text-xl font-bold mb-4">
                  本局结束 ({players.filter(p => p.chips > 0).length} 人还有筹码)
                </p>
                {players.filter(p => p.chips > 0).length >= 2 ? (
                  <button
                    onClick={handleStartNextHand}
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xl rounded-2xl shadow-lg transition-all active:scale-95"
                  >
                    ▶️ 开始下一局
                  </button>
                ) : (
                  <p className="text-white/60 text-sm">等待更多玩家入座...</p>
                )}
              </div>
            </div>
          )}
        </div>
        {/* End table-scaler */}
      </div>

      {/* Action Bar */}
      {isPlaying && (
        <ActionBar
          canCheck={canCheck}
          canCall={!!canCall}
          callAmount={toCall}
          canRaise={!!canRaise}
          minRaise={myPlayer?.minRaise ?? 0}
          maxRaise={myPlayer?.chips ?? 0}
          chips={myPlayer?.chips ?? 0}
          isMyTurn={!!isMyTurn}
          onAction={handleAction}
          timerSeconds={timerSeconds}
          className="shrink-0 pb-5"
        />
      )}

      {/* Voice Chat Controls */}
      <VoiceControls
        speakingUsers={speakingUsers}
        error={voiceError}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
        onResetVoice={resetVoice}
      />

      {/* Showdown Modal */}
      {showdown && (
        <ShowdownModal showdown={showdown} myUserId={user?.id ?? ''} onClose={handleCloseShowdown} />
      )}
    </div>
  );
}
