import type { Card, Suit, Rank } from '../types/index.js';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCard(deck: Card[]): { card: Card; remainingDeck: Card[] } {
  if (deck.length === 0) {
    throw new Error('Deck is empty');
  }
  const [card, ...remainingDeck] = deck;
  return { card, remainingDeck };
}

export function cardToString(card: Card): string {
  return card.rank + card.suit[0].toUpperCase();
}

export function stringToCard(str: string): Card {
  const suitMap: Record<string, Suit> = {
    'S': 'spades', 'H': 'hearts', 'D': 'diamonds', 'C': 'clubs',
  };
  return {
    rank: str[0].toUpperCase() as Rank,
    suit: suitMap[str[1]?.toUpperCase()] ?? 'spades',
  };
}

export function getCardNumericValue(rank: Rank): number {
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return values[rank];
}
