import type { Card as CardType } from '../types';
import { Card } from './Card';

interface CommunityCardsProps {
  cards: CardType[];
  round: string;
}

const ROUND_LABELS: Record<string, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
  waiting: '等待开始',
};

export function CommunityCards({ cards, round }: CommunityCardsProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-white/60 text-xs font-medium uppercase tracking-widest">
        {ROUND_LABELS[round] || round}
      </span>
      <div className="flex gap-2 p-4 bg-black/20 rounded-2xl border border-white/10">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card
            key={i}
            card={cards[i]}
            faceDown={!cards[i]}
            delay={i * 100}
          />
        ))}
      </div>
    </div>
  );
}
