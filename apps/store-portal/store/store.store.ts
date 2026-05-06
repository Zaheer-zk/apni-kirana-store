import { create } from 'zustand';
import type { UserProfile, StoreProfile } from '@aks/shared';

interface StorePortalState {
  user: UserProfile | null;
  storeProfile: StoreProfile | null;
  accessToken: string | null;
  incomingOrderId: string | null;

  setAuth: (
    token: string,
    user: UserProfile,
    storeProfile: StoreProfile | null
  ) => void;
  clearAuth: () => void;
  setStoreProfile: (profile: StoreProfile) => void;
  setStoreOpen: (open: boolean) => void;
  setIncomingOrder: (orderId: string | null) => void;
}

export const useStorePortalStore = create<StorePortalState>((set) => ({
  user: null,
  storeProfile: null,
  accessToken: null,
  incomingOrderId: null,

  setAuth: (token, user, storeProfile) =>
    set({
      accessToken: token,
      user,
      storeProfile,
    }),

  clearAuth: () =>
    set({
      accessToken: null,
      user: null,
      storeProfile: null,
      incomingOrderId: null,
    }),

  setStoreProfile: (profile) => set({ storeProfile: profile }),

  setStoreOpen: (open) =>
    set((state) => ({
      storeProfile: state.storeProfile
        ? { ...state.storeProfile, isOpen: open }
        : null,
    })),

  setIncomingOrder: (orderId) => set({ incomingOrderId: orderId }),
}));
