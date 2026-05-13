import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { CommunityCards } from '../components/CommunityCards';
import { PlayerSeat } from '../components/PlayerSeat';
import { PotDisplay } from '../components/PotDisplay';
import { ActionBar } from '../components/ActionBar';
import { ShowdownModal } from '../components/ShowdownModal';
import { Card } from '../components/Card';
import type { PublicRoomState, HandInfo, HandAction, ShowdownInfo } from '../types';

const SEAT_POSITIONS = [
  { bottom: '0', left: '50%', transform: 'translateX(-50%)' },        // 0 - bottom center (self)
  { bottom: '18%', right: '10%' },                                     // 1 - bottom right
  { bottom: '38%', right: '2%' },                                      // 2 - mid right
  { bottom: '58%', right: '2%' },                                      // 3 - top right
  { top: '10%', right: '10%' },                                        // 4 - top right corner
  { top: '10%', left: '50%', transform: 'translateX(-50%)' },          // 5 - top center
  { top: '10%', left: '10%' },                                        // 6 - top left corner
  { bottom: '58%', left: '2%' },                                       // 7 - top left
  { bottom: '38%', left: '2%' },                                       // 8 - mid left
  { bottom: '18%', left: '10%' },                                      // 9 - bottom left
];

// 动态计算均匀分布的位置
const getUniformPosition = (playerSeat: number, totalPlayers: number, mySeat: number) => {
  // 将当前玩家放在底部中间位置
  const adjustedSeat = (playerSeat - mySeat + totalPlayers) % totalPlayers;
  
  // 计算每个玩家之间的角度间隔（均匀分布在椭圆上）
  // 底部区域占 40%，顶部区域占 40%，两侧各 10%
  // 定义一个更均匀的分布：围绕椭圆中心分布
  const positions: Array<{ left?: string; right?: string; top?: string; bottom?: string; transform?: string }> = [];
  
  if (totalPlayers === 1) {
    // 单独一个玩家在底部中间
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
  } else if (totalPlayers === 2) {
    // 两个玩家：底部中间和顶部中间
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
  } else if (totalPlayers === 3) {
    // 三个玩家：底部中间、右侧、左侧
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '15%', right: '8%' });
    positions.push({ top: '15%', left: '8%' });
  } else if (totalPlayers === 4) {
    // 四个玩家：底部、右下、左下、顶部
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '15%', right: '8%' });
    positions.push({ bottom: '15%', left: '8%' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
  } else if (totalPlayers === 5) {
    // 五个玩家
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '12%', right: '8%' });
    positions.push({ top: '18%', right: '5%' });
    positions.push({ top: '18%', left: '5%' });
    positions.push({ bottom: '12%', left: '8%' });
  } else if (totalPlayers === 6) {
    // 六个玩家：底部、右下、右上、左上、左下、顶部
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '15%', right: '8%' });
    positions.push({ top: '15%', right: '8%' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '15%', left: '8%' });
    positions.push({ bottom: '15%', left: '8%' });
  } else if (totalPlayers === 7) {
    // 七个玩家
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '10%', right: '12%' });
    positions.push({ bottom: '45%', right: '3%' });
    positions.push({ top: '12%', right: '8%' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '12%', left: '8%' });
    positions.push({ bottom: '45%', left: '3%' });
    positions.push({ bottom: '10%', left: '12%' });
  } else if (totalPlayers === 8) {
    // 八个玩家
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '10%', right: '12%' });
    positions.push({ bottom: '38%', right: '3%' });
    positions.push({ top: '12%', right: '8%' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '12%', left: '8%' });
    positions.push({ bottom: '38%', left: '3%' });
    positions.push({ bottom: '10%', left: '12%' });
  } else if (totalPlayers === 9) {
    // 九个玩家
    positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ bottom: '8%', right: '14%' });
    positions.push({ bottom: '30%', right: '3%' });
    positions.push({ top: '12%', right: '5%' });
    positions.push({ top: '8%', right: '5%' });
    positions.push({ top: '10%', left: '50%', transform: 'translateX(-50%)' });
    positions.push({ top: '8%', left: '5%' });
    positions.push({ top: '12%', left: '5%' });
    positions.push({ bottom: '30%', left: '3%' });
    positions.push({ bottom: '8%', left: '14%' });
  } else {
    // 10+ 玩家使用原始固定位置
    const adjustedIndex = (adjustedSeat % SEAT_POSITIONS.length);
    return SEAT_POSITIONS[adjustedIndex];
  }
  
  return positions[adjustedSeat] || { bottom: '0', left: '50%', transform: 'translateX(-50%)' };
};

export function GameTable() {
  const navigate = useNavigate();
  const { user, token, currentRoom, myHand, showdown, setRoom, setMyHand, setShowdown, clearRoom } = useGameStore();

  useEffect(() => {
    if (!token || !user) {
      navigate('/');
      return;
    }

    // Listen for room state updates
    const offState = socketService.on('room:state', (data: unknown) => {
      const d = data as { roomId: string; } & PublicRoomState;
      console.log('[DEBUG] room:state received', { roomId: d.roomId, currentRoomId: currentRoom?.roomId, d });
      if (d.roomId === currentRoom?.roomId || !currentRoom) {
        console.log('[DEBUG] setRoom called, myHand BEFORE:', useGameStore.getState().myHand);
        setRoom(d as PublicRoomState);
        console.log('[DEBUG] setRoom done, myHand AFTER:', useGameStore.getState().myHand);
      }
    });

    // Listen for hand dealt to self
    const offHand = socketService.on('hand:dealt', (data: unknown) => {
      const d = data as { userId: string; cards: unknown[] };
      console.log('[DEBUG] hand:dealt received', { userId: d.userId, myUserId: user.id, cards: d.cards });
      if (d.userId === user.id) {
        setMyHand({ cards: d.cards as HandInfo['cards'] });
        console.log('[DEBUG] setMyHand called, myHand now:', useGameStore.getState().myHand);
      }
    });

    // Listen for showdown
    const offShowdown = socketService.on('game:showdown', (data: unknown) => {
      const d = data as { roomId: string } & ShowdownInfo;
      console.log('[DEBUG] game:showdown received', d);
      setShowdown(d);
    });

    // Listen for game ended
    const offEnd = socketService.on('game:ended', (_data: unknown) => {
      console.log('[DEBUG] game:ended received');
    });

    return () => {
      offState();
      offHand();
      offShowdown();
      offEnd();
    };
  }, [token, user, navigate, currentRoom, setRoom, setMyHand, setShowdown]);

  const handleAction = useCallback(async (action: HandAction, amount?: number) => {
    try {
      await socketService.takeAction(action, amount);
    } catch (err) {
      console.error('Action failed:', err);
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
      console.error('Start game failed:', err);
    }
  }, []);

  const handleStartNextHand = useCallback(async () => {
    try {
      await socketService.startNextHand();
    } catch (err) {
      console.error('Start next hand failed:', err);
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
      console.error('Add bot failed:', err);
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
  const mySeat = myPlayer?.seat ?? 0;
  const isMyTurn = myPlayer?.seat === currentTurn;

  const isWaiting = currentRoom.status === 'waiting';
  const canCheck = isMyTurn && myPlayer && !myPlayer.folded && !myPlayer.allin && (currentRoom.lastRaise === 0);
  const toCall = currentRoom.lastRaise > 0 && myPlayer ? currentRoom.lastRaise : 0;
  const canCall = isMyTurn && toCall > 0 && myPlayer && !myPlayer.folded && !myPlayer.allin;

  // 动态计算均匀分布的位置
  const getPosition = (playerSeat: number) => {
    return getUniformPosition(playerSeat, players.length, mySeat);
  };

  return (
    <div className="min-h-screen flex flex-col bg-black overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10">
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
      <div className="flex-1 table-felt relative flex items-center justify-center p-4 overflow-hidden">
        {/* Decorative chip pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
        </div>

        {/* Pot */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <PotDisplay pot={pot} sidePots={sidePots} />
        </div>

        {/* Community Cards */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -mt-12 z-5">
          <CommunityCards cards={communityCards} round={round} />
        </div>

        {/* Player Seats */}
        {players.map((player) => (
          <PlayerSeat
            key={player.userId}
            player={player}
            isCurrentTurn={player.seat === currentTurn}
            isDealer={player.seat === dealerSeat}
            isMySeat={player.userId === user?.id}
            position={getPosition(player.seat)}
          />
        ))}

        {/* My hand (bottom center) */}
        {myHand && round !== 'waiting' && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex gap-1">
            {myHand.cards.map((card, i) => (
              <Card key={i} card={card} delay={i * 100} />
            ))}
          </div>
        )}

        {/* Debug: myHand state */}
        <div className="absolute top-2 left-2 bg-black/80 text-green-400 text-xs font-mono p-2 rounded border border-green-500/30 z-50">
          DEBUG myHand: {JSON.stringify(myHand)}<br/>
          DEBUG round: {round}<br/>
          DEBUG roomStatus: {currentRoom.status}
        </div>

        {/* Start game button */}
        {isWaiting && myPlayer && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
            <div className="text-center">
              <p className="text-white text-xl font-bold mb-4">
                等待玩家入座... ({players.length} 人)
              </p>
              {/* Add bot button */}
              <button
                onClick={handleAddBot}
                className="px-6 py-3 mb-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all active:scale-95"
              >
                🤖 添加机器人
              </button>
              {players.length >= 2 && myPlayer.seat === dealerSeat && (
                <button
                  onClick={handleStartGame}
                  className="block w-full px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-2xl shadow-lg transition-all active:scale-95"
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
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

      {/* Action Bar */}
      {!isWaiting && (
        <ActionBar
          canCheck={canCheck}
          canCall={!!canCall}
          callAmount={toCall}
          minRaise={Math.max(currentRoom.lastRaise * 2, blindBig)}
          maxRaise={(myPlayer?.chips ?? 0) + (myPlayer?.bet ?? 0)}
          chips={myPlayer?.chips ?? 0}
          isMyTurn={!!isMyTurn}
          onAction={handleAction}
        />
      )}

      {/* Showdown Modal */}
      {showdown && (
        <ShowdownModal showdown={showdown} myUserId={user?.id ?? ''} onClose={handleCloseShowdown} />
      )}
    </div>
  );
}
