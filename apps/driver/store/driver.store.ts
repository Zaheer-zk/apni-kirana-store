import { create } from 'zustand';
import type { UserProfile, DriverProfile } from '@aks/shared';

interface DriverState {
  user: UserProfile | null;
  driverProfile: DriverProfile | null;
  accessToken: string | null;
  isOnline: boolean;
  activeOrderId: string | null;
  incomingOrderId: string | null;

  setAuth: (
    token: string,
    user: UserProfile,
    driverProfile: DriverProfile | null
  ) => void;
  clearAuth: () => void;
  setOnline: (online: boolean) => void;
  setActiveOrder: (orderId: string | null) => void;
  setIncomingOrder: (orderId: string | null) => void;
  clearIncomingOrder: () => void;
  setDriverProfile: (profile: DriverProfile) => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  user: null,
  driverProfile: null,
  accessToken: null,
  isOnline: false,
  activeOrderId: null,
  incomingOrderId: null,

  setAuth: (token, user, driverProfile) =>
    set({
      accessToken: token,
      user,
      driverProfile,
      isOnline: false,
    }),

  clearAuth: () =>
    set({
      accessToken: null,
      user: null,
      driverProfile: null,
      isOnline: false,
      activeOrderId: null,
      incomingOrderId: null,
    }),

  setOnline: (online) => set({ isOnline: online }),

  setActiveOrder: (orderId) => set({ activeOrderId: orderId }),

  setIncomingOrder: (orderId) => set({ incomingOrderId: orderId }),

  clearIncomingOrder: () => set({ incomingOrderId: null }),

  setDriverProfile: (profile) => set({ driverProfile: profile }),
}));
