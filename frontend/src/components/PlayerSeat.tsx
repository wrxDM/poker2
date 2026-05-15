import type { PlayerPublic } from '../types';
import { Card } from './Card';

interface PlayerSeatProps {
  player: PlayerPublic;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isMySeat: boolean;
  isSpeaking?: boolean;
  position: { top?: string; bottom?: string; left?: string; right?: string };
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isMySeat,
  isSpeaking,
  position,
}: PlayerSeatProps) {
  return (
    <div
      className={`
        absolute flex flex-col items-center gap-1 transition-all duration-300
        ${isCurrentTurn ? 'turn-glow' : ''}
        ${isMySeat ? 'z-10' : 'z-0'}
        ${isSpeaking ? 'scale-110' : ''}
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
        {/* Dealer / Turn / Blind / Bot indicator */}
        {isDealer && (
          <div className="absolute -top-2 -left-1 w-5 h-5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center border border-yellow-600">
            D
          </div>
        )}
        {isSmallBlind && !isDealer && (
          <div className="absolute -top-2 -left-1 w-5 h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center border border-pink-600">
            SB
          </div>
        )}
        {isBigBlind && !isDealer && (
          <div className="absolute -top-2 -left-1 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center border border-blue-600">
            BB
          </div>
        )}
        {player.isBot && (
          <div className="absolute -top-2 -right-1 w-5 h-5 bg-purple-500 text-white text-xs font-bold rounded-full flex items-center justify-center border border-purple-600">
            🤖
          </div>
        )}
        {isCurrentTurn && !player.isBot && (
          <div className="absolute -top-2 -right-1 w-5 h-5 bg-green-500 text-black text-xs font-bold rounded-full flex items-center justify-center border border-green-600 animate-pulse">
            ▶
          </div>
        )}

        {/* Voice status badge */}
        {player.isBot !== true && (
          <div className={`
            absolute -bottom-2 left-1/2 transform -translate-x-1/2
            flex items-center justify-center
            ${player.muted
              ? 'text-gray-500'
              : isSpeaking
                ? 'text-green-400'
                : 'text-green-600/70'
            }
          `}>
            {player.muted ? (
              // Muted
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.27 3L2 4.27l4.18 4.18C6.06 8.75 6 9.12 6 9.5V12c0 2.65 1.77 4.9 4.23 5.74L9 21h2l1 1h4l1-1h2l1.77-3.26C21.23 17.9 23 15.65 23 13V9.5c0-.38-.06-.75-.18-1.09L22 4.27 20.73 3 3.27 3zM12 15.5c-1.38 0-2.5-1.12-2.5-2.5V9.5c0-.38.06-.75.18-1.09l.59-.59h3.46c.38 0 .75.06 1.09.18l.59.59v2c0 1.38-1.12 2.5-2.5 2.5z"/>
                <line x1="1" y1="1" x2="23" y2="23" stroke="black" strokeWidth="2"/>
              </svg>
            ) : isSpeaking ? (
              // Speaking — animated bars
              <div className="flex items-center gap-px">
                <span className="w-0.5 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              // Mic on, silent
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 opacity-60">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            )}
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
