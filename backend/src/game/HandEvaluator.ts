import type { Card, EvaluatedHand, HandRank } from '../types/index.js';
import { getCardNumericValue } from './Deck.js';

function getRankFrequency(cards: Card[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const card of cards) {
    freq.set(card.rank, (freq.get(card.rank) || 0) + 1);
  }
  return freq;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length < 5) return false;
  const suit = cards[0].suit;
  return cards.slice(0, 5).every(c => c.suit === suit);
}

function isStraight(sortedValues: number[]): boolean {
  if (sortedValues.length < 5) return false;
  const unique = [...new Set(sortedValues)].sort((a, b) => a - b);
  if (unique.length < 5) return false;

  // Check normal straight
  for (let i = 0; i <= unique.length - 5; i++) {
    if (
      unique[i + 4] - unique[i] === 4 &&
      unique.slice(i, i + 5).length === 5
    ) {
      return true;
    }
  }

  // Check wheel (A-2-3-4-5)
  const wheel = [14, 2, 3, 4, 5];
  if (
    unique.includes(14) && unique.includes(2) &&
    unique.includes(3) && unique.includes(4) && unique.includes(5)
  ) {
    return true;
  }

  return false;
}

function getSortedValues(cards: Card[]): number[] {
  return cards.map(c => getCardNumericValue(c.rank)).sort((a, b) => a - b);
}

function evaluateRank(
  cards: Card[],
  rank: HandRank,
  baseScore: number,
): EvaluatedHand {
  const values = getSortedValues(cards);
  const kickers = [...new Set(values)].sort((a, b) => {
    const countA = values.filter(v => v === a).length;
    const countB = values.filter(v => v === b).length;
    if (countA !== countB) return countB - countA;
    return b - a;
  }).slice(0, 5);

  const rankNames: Record<HandRank, string> = {
    high_card: '高牌',
    pair: '一对',
    two_pair: '两对',
    three_of_a_kind: '三条',
    straight: '顺子',
    flush: '同花',
    full_house: '葫芦',
    four_of_a_kind: '四条',
    straight_flush: '同花顺',
  };

  return {
    rank,
    score: baseScore + kickers.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0),
    kickers,
    description: rankNames[rank],
  };
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const allCards = [...holeCards, ...communityCards];

  // Need at least 5 cards to evaluate
  if (allCards.length < 5) {
    const values = getSortedValues(allCards);
    return {
      rank: 'high_card',
      score: values.reduce((acc, v, i) => acc + v * Math.pow(15, 4 - i), 0),
      kickers: values,
      description: '高牌',
    };
  }

  // Enumerate all 5-card combinations
  const combinations = getCombinations(allCards, 5);
  let best: EvaluatedHand = {
    rank: 'high_card',
    score: 0,
    kickers: [],
    description: '',
  };

  for (const combo of combinations) {
    const evaluated = evaluateCombination(combo);
    if (evaluated.score > best.score) {
      best = evaluated;
    }
  }

  return best;
}

function evaluateCombination(cards: Card[]): EvaluatedHand {
  const freq = getRankFrequency(cards);
  const sortedValues = getSortedValues(cards);
  const flush = isFlush(cards);
  const straight = isStraight(sortedValues);

  const counts = [...freq.values()].sort((a, b) => b - a);
  const isWheel = sortedValues.includes(14) && sortedValues.includes(2) &&
    sortedValues.includes(3) && sortedValues.includes(4) && sortedValues.includes(5);

  // Straight flush
  if (flush && straight) {
    return evaluateRank(cards, 'straight_flush', 9_000_000);
  }

  // Four of a kind
  if (counts[0] === 4) {
    return evaluateRank(cards, 'four_of_a_kind', 8_000_000);
  }

  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    return evaluateRank(cards, 'full_house', 7_000_000);
  }

  // Flush
  if (flush) {
    return evaluateRank(cards, 'flush', 6_000_000);
  }

  // Straight
  if (straight) {
    if (isWheel) {
      return evaluateRank(cards, 'straight', 5_000_000); // A-5 is lowest straight
    }
    return evaluateRank(cards, 'straight', 5_000_000 + sortedValues[sortedValues.length - 1]);
  }

  // Three of a kind
  if (counts[0] === 3) {
    return evaluateRank(cards, 'three_of_a_kind', 4_000_000);
  }

  // Two pair
  if (counts[0] === 2 && counts[1] === 2) {
    return evaluateRank(cards, 'two_pair', 3_000_000);
  }

  // One pair
  if (counts[0] === 2) {
    return evaluateRank(cards, 'pair', 2_000_000);
  }

  // High card
  return evaluateRank(cards, 'high_card', 1_000_000);
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map(item => [item]);
  if (k === arr.length) return [arr];
  if (k > arr.length) return [];

  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombos = getCombinations(arr.slice(i + 1), k - 1);
    for (const combo of tailCombos) {
      result.push([head, ...combo]);
    }
  }
  return result;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  // 返回 1 表示 a 赢，-1 表示 b 赢，0 表示平手
  if (a.score > b.score) return 1;
  if (a.score < b.score) return -1;
  return 0;
}
