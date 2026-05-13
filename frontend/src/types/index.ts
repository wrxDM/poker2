export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';
export type GameRound = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
export type HandRank = 'high_card' | 'pair' | 'two_pair' | 'three_of_a_kind' | 'straight' | 'flush' | 'full_house' | 'four_of_a_kind' | 'straight_flush';

export interface PlayerPublic {
  userId: string;
  username: string;
  seat: number;
  chips: number;
  bet: number;
  folded: boolean;
  allin: boolean;
  disconnected: boolean;
  lastAction?: HandAction;
  isBot?: boolean;
}

export interface PublicRoomState {
  roomId: string;
  name: string;
  blindSmall: number;
  blindBig: number;
  status: 'waiting' | 'playing' | 'finished';
  players: PlayerPublic[];
  communityCards: Card[];
  pot: number;
  sidePots: number[];
  currentTurn: number;
  round: GameRound;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  lastRaise: number;
  minRaise: number;
}

export interface User {
  id: string;
  username: string;
  chips: number;
  avatarUrl?: string;
}

export interface HandInfo {
  cards: Card[];
  evaluatedHand?: {
    rank: HandRank;
    score: number;
    kickers: number[];
    description: string;
  };
}

export interface RoomInfo {
  roomId: string;
  name: string;
  blindSmall: number;
  blindBig: number;
  playerCount: number;
  status: string;
}

export interface ShowdownInfo {
  winners: {
    playerId: string;
    username: string;
    hand: Card[];
    evaluatedHand: { rank: HandRank; description: string; score: number; kickers: number[] };
    amount: number;
  }[];
  pots: { amount: number; winners: string[] }[];
  communityCards: Card[];
}
