export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export type GameRound = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export type HandRank =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush';

export interface EvaluatedHand {
  rank: HandRank;
  score: number;
  kickers: number[];
  description: string;
}

export interface PlayerInRoom {
  userId: string;
  username: string;
  seat: number;
  chips: number;
  bet: number;
  totalBet: number;
  minRaise: number;
  folded: boolean;
  allin: boolean;
  disconnected: boolean;
  hand?: Card[];
  lastAction?: HandAction;
  isBot?: boolean;
}

export interface RoomState {
  roomId: string;
  name: string;
  blindSmall: number;
  blindBig: number;
  status: 'waiting' | 'playing' | 'finished';
  players: PlayerInRoom[];
  communityCards: Card[];
  pot: number;
  sidePots: number[];
  currentTurn: number;
  round: GameRound;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  currentBet: number;
  lastRaise: number;
  createdAt: number;
  deck: Card[];
}

export interface PublicRoomState extends Omit<RoomState, 'deck'> {
  players: Omit<PlayerInRoom, 'hand'>[];
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  chips: number;
  avatarUrl?: string;
  createdAt: Date;
}

export interface PlayerActionEvent {
  userId: string;
  roomId: string;
  action: HandAction;
  amount?: number;
}

export interface JwtPayload {
  userId: string;
  username: string;
}
