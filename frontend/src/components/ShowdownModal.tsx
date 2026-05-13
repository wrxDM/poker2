import type { ShowdownInfo, Card as CardType } from '../types';
import { Card } from './Card';

interface ShowdownModalProps {
  showdown: ShowdownInfo;
  myUserId: string;
  onClose: () => void;
}

export function ShowdownModal({ showdown, myUserId, onClose }: ShowdownModalProps) {
  const winnerIds = showdown.winners.map(w => w.playerId);
  const isWinner = winnerIds.includes(myUserId);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-yellow-600/50 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`py-6 text-center ${isWinner ? 'bg-yellow-600/20' : 'bg-red-900/20'}`}>
          <div className="text-4xl mb-2">{isWinner ? '🏆' : '😔'}</div>
          <h2 className={`text-2xl font-bold font-display ${isWinner ? 'text-yellow-400' : 'text-gray-300'}`}>
            {isWinner ? '你赢了！' : '你输了'}
          </h2>
          <p className="text-white/60 text-sm mt-1">
            共 {showdown.pots?.[0]?.amount.toLocaleString() ?? 0} 筹码
          </p>
        </div>

        {/* Winners */}
        <div className="px-6 py-4 space-y-4">
          <h3 className="text-white/80 text-sm font-semibold uppercase tracking-wider">获胜者</h3>
          {showdown.winners.map((w) => {
            const won = w.playerId === myUserId;
            return (
              <div key={w.playerId} className={`flex items-center justify-between p-3 rounded-xl ${won ? 'bg-yellow-600/10 border border-yellow-600/30' : 'bg-white/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{won ? '👤' : '🤖'}</div>
                  <div>
                    <div className="text-white font-bold">{w.username}</div>
                    <div className="text-yellow-400 text-sm font-medium">{w.evaluatedHand.description}</div>
                  </div>
                </div>
                <div className="text-green-400 font-bold text-lg">
                  +{w.amount.toLocaleString()}
                </div>
              </div>
            );
          })}

          {/* Community cards */}
          <div>
            <h3 className="text-white/80 text-sm font-semibold uppercase tracking-wider mb-2">公共牌</h3>
            <div className="flex gap-1 justify-center">
              {showdown.communityCards.map((card, i) => (
                <Card key={i} card={card as CardType} small />
              ))}
            </div>
          </div>

          {/* Winner's hand */}
          {showdown.winners.map((w) => (
            <div key={w.playerId} className="flex flex-col items-center gap-2 p-3 bg-white/5 rounded-xl">
              <span className="text-white/60 text-xs">{w.username} 的手牌</span>
              <div className="flex gap-1">
                {w.hand.map((card, i) => (
                  <Card key={i} card={card as CardType} small />
                ))}
              </div>
              <span className="text-yellow-400 text-sm font-bold">{w.evaluatedHand.description}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-xl transition-colors"
          >
            继续
          </button>
        </div>
      </div>
    </div>
  );
}
