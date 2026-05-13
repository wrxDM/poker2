import type { PlayerPublic } from '../types';
import { Card } from './Card';

interface PlayerSeatProps {
  player: PlayerPublic;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isMySeat: boolean;
  position: { top?: string; bottom?: string; left?: string; right?: string };
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isDealer,
  isMySeat,
  position,
}: PlayerSeatProps) {
  return (
    <div
      className={`
        absolute flex flex-col items-center gap-1 transition-all duration-300
        ${isCurrentTurn ? 'turn-glow' : ''}
        ${isMySeat ? 'z-10' : 'z-0'}
      `}
      style={position}
    >
      {/* Cards */}
      <div className="flex gap-0.5">
        <Card faceDown small />
        <Card faceDown small />
      </div>

      {/* Player info */}
      <div
        className={`
          flex flex-col items-center px-3 py-1.5 rounded-xl min-w-[80px]
          backdrop-blur-sm border-2 transition-all duration-200
          ${isMySeat
            ? 'bg-yellow-600/80 border-yellow-400'
            : player.folded
              ? 'bg-gray-700/60 border-gray-500 opacity-60'
              : player.allin
                ? 'bg-purple-900/80 border-purple-400'
                : 'bg-black/60 border-white/30'
          }
          ${isCurrentTurn ? 'border-yellow-400 ring-2 ring-yellow-400/50' : ''}
        `}
      >
        {/* Dealer / Turn indicator */}
        {isDealer && (
          <div className="absolute -top-2 -left-1 w-5 h-5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center border border-yellow-600">
            D
          </div>
        )}
        {isCurrentTurn && (
          <div className="absolute -top-2 -right-1 w-5 h-5 bg-green-500 text-black text-xs font-bold rounded-full flex items-center justify-center border border-green-600 animate-pulse">
            ▶
          </div>
        )}

        <span className="text-white text-xs font-semibold truncate max-w-[70px]">
          {isMySeat ? '你' : player.username}
        </span>
        <span className="text-yellow-300 text-xs font-bold">
          💰 {player.chips.toLocaleString()}
        </span>
        {player.bet > 0 && (
          <span className="text-white/70 text-xs">
            注: {player.bet.toLocaleString()}
          </span>
        )}
        {player.allin && (
          <span className="text-purple-300 text-xs font-bold animate-pulse">ALL IN</span>
        )}
        {player.folded && (
          <span className="text-gray-400 text-xs line-through">弃牌</span>
        )}
      </div>
    </div>
  );
}
