import { create } from 'zustand';
import type { UserProfile } from '@aks/shared';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  setAuth: (user: UserProfile, accessToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,

  setAuth: (user: UserProfile, accessToken: string) => {
    set({ user, accessToken });
  },

  clearAuth: () => {
    set({ user: null, accessToken: null });
  },
}));
