import type { Card as CardType, Suit, Rank } from '../types';

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SUIT_COLORS: Record<Suit, string> = {
  spades: 'text-gray-900',
  clubs: 'text-gray-900',
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
};

const RANK_DISPLAY: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  small?: boolean;
  className?: string;
  delay?: number;
}

export function Card({ card, faceDown = false, small = false, className = '', delay = 0 }: CardProps) {
  const sizeClass = small ? 'w-12 h-16' : 'w-16 h-24 sm:w-20 sm:h-28';

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClass} rounded-lg border-2 border-white/40 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-card animate-card-deal ${className}`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-white/30 rounded-full flex items-center justify-center">
          <span className="text-white/50 text-xs sm:text-sm font-bold">?</span>
        </div>
      </div>
    );
  }

  const color = SUIT_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];
  const rankDisplay = RANK_DISPLAY[card.rank];

  return (
    <div
      className={`${sizeClass} rounded-lg border-2 border-white bg-white shadow-card flex flex-col p-1 sm:p-1.5 animate-card-deal ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top left */}
      <div className={`flex flex-col items-start ${color}`}>
        <span className={`font-bold leading-none ${small ? 'text-xs' : 'text-sm sm:text-base'}`}>{rankDisplay}</span>
        <span className={`leading-none ${small ? 'text-xs' : 'text-sm sm:text-lg'}`}>{symbol}</span>
      </div>

      {/* Center suit */}
      <div className={`flex-1 flex items-center justify-center ${color}`}>
        <span className={`leading-none ${small ? 'text-xl' : 'text-3xl sm:text-4xl'}`}>{symbol}</span>
      </div>

      {/* Bottom right (inverted) */}
      {/* <div className={`flex flex-col items-end ${color} transform rotate-180`}>
        <span className={`font-bold leading-none ${small ? 'text-xs' : 'text-sm sm:text-base'}`}>{rankDisplay}</span>
        <span className={`leading-none ${small ? 'text-xs' : 'text-sm sm:text-lg'}`}>{symbol}</span>
      </div> */}
    </div>
  );
}
