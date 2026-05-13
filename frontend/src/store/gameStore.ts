import { create } from 'zustand';
import type { User, PublicRoomState, HandInfo, ShowdownInfo } from '../types';

interface GameStore {
  // Auth
  user: User | null;
  token: string | null;
  setUser: (user: User | null, token: string | null) => void;
  setChips: (chips: number) => void;

  // Room
  currentRoom: PublicRoomState | null;
  myHand: HandInfo | null;
  showdown: ShowdownInfo | null;

  setRoom: (room: PublicRoomState | null) => void;
  setMyHand: (hand: HandInfo | null) => void;
  setShowdown: (result: ShowdownInfo | null) => void;
  clearShowdown: () => void;
  clearRoom: () => void;

  // UI state
  raiseAmount: number;
  setRaiseAmount: (amount: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  user: null,
  token: null,
  setUser: (user, token) => set({ user, token }),
  setChips: (chips) => set((state) => ({ user: state.user ? { ...state.user, chips } : null })),

  currentRoom: null,
  myHand: null,
  showdown: null,

  setRoom: (room) => set({ currentRoom: room}),
  setMyHand: (hand) => set({ myHand: hand }),
  setShowdown: (result) => set({ showdown: result }),
  clearShowdown: () => set({ showdown: null }),
  clearRoom: () => set({ currentRoom: null, myHand: null, showdown: null }),

  raiseAmount: 0,
  setRaiseAmount: (amount) => set({ raiseAmount: amount }),
}));
