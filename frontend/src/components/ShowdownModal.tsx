import { useState, useEffect } from 'react';
import type { ShowdownInfo, Card as CardType } from '../types';
import { Card } from './Card';

interface ShowdownModalProps {
  showdown: ShowdownInfo;
  myUserId: string;
  onClose: () => void;
}

export function ShowdownModal({ showdown, myUserId, onClose }: ShowdownModalProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      // Scale down if viewport is small (mobile portrait) or narrow (mobile landscape)
      const heightScale = Math.min(1, vh / 640);
      const widthScale = Math.min(1, vw / 400);
      setScale(Math.min(heightScale, widthScale, 1));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const winnerIds = showdown.winners.map(w => w.playerId);
  const isWinner = winnerIds.includes(myUserId);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div
        className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-yellow-600/50 shadow-2xl w-full mx-4 overflow-hidden flex flex-col"
        style={{
          maxWidth: '28rem',
          maxHeight: '90vh',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Header */}
        <div className={`py-4 sm:py-6 text-center shrink-0 ${isWinner ? 'bg-yellow-600/20' : 'bg-red-900/20'}`}>
          <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">{isWinner ? '🏆' : '😔'}</div>
          <h2 className={`text-lg sm:text-2xl font-bold font-display ${isWinner ? 'text-yellow-400' : 'text-gray-300'}`}>
            {isWinner ? '你赢了！' : '你输了'}
          </h2>
          <p className="text-white/60 text-xs sm:text-sm mt-1">
            共 {showdown.pots?.[0]?.amount.toLocaleString() ?? 0} 筹码
          </p>
        </div>

        {/* Scrollable content */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0">
          <h3 className="text-white/80 text-xs sm:text-sm font-semibold uppercase tracking-wider">获胜者</h3>
          {showdown.winners.map((w) => {
            const won = w.playerId === myUserId;
            return (
              <div key={w.playerId} className={`flex items-center justify-between p-2 sm:p-3 rounded-xl ${won ? 'bg-yellow-600/10 border border-yellow-600/30' : 'bg-white/5'}`}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="text-xl sm:text-2xl shrink-0">{won ? '👤' : '🤖'}</div>
                  <div className="min-w-0">
                    <div className="text-white font-bold text-sm sm:text-base truncate">{w.username}</div>
                    <div className="text-yellow-400 text-xs sm:text-sm font-medium truncate">{w.evaluatedHand.description}</div>
                  </div>
                </div>
                <div className="text-green-400 font-bold text-base sm:text-lg shrink-0 ml-2">
                  +{w.amount.toLocaleString()}
                </div>
              </div>
            );
          })}

          {/* Community cards */}
          <div>
            <h3 className="text-white/80 text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1 sm:mb-2">公共牌</h3>
            <div className="flex gap-1 justify-center">
              {showdown.communityCards.map((card, i) => (
                <Card key={i} card={card as CardType} small />
              ))}
            </div>
          </div>

          {/* Winner's hand */}
          {showdown.winners.map((w) => (
            <div key={w.playerId} className="flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-3 bg-white/5 rounded-xl">
              <span className="text-white/60 text-xs">{w.username} 的手牌</span>
              <div className="flex gap-1">
                {w.hand.map((card, i) => (
                  <Card key={i} card={card as CardType} small />
                ))}
              </div>
              <span className="text-yellow-400 text-xs sm:text-sm font-bold">{w.evaluatedHand.description}</span>
            </div>
          ))}
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 sm:py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-xl transition-colors text-sm sm:text-base"
          >
            继续
          </button>
        </div>
      </div>
    </div>
  );
}
