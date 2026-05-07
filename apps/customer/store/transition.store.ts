import { create } from 'zustand';

/**
 * Global "transition overlay" — a full-screen branded splash that survives
 * across navigation. Use when one screen is about to push/replace another and
 * the next screen needs a beat to mount (e.g. login → home, big query loads).
 *
 *   const { showTransition, hideTransition } = useTransitionStore.getState();
 *   showTransition('Welcome back!');           // overlay appears
 *   router.replace('/(tabs)/home');            // navigation runs underneath
 *   // Overlay auto-hides after 2s, or call hideTransition() yourself once
 *   // the destination screen is ready.
 */
interface TransitionState {
  visible: boolean;
  message: string | null;
  showTransition: (message: string, autoHideMs?: number) => void;
  hideTransition: () => void;
}

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

export const useTransitionStore = create<TransitionState>((set) => ({
  visible: false,
  message: null,
  showTransition: (message, autoHideMs = 2000) => {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    set({ visible: true, message });
    if (autoHideMs > 0) {
      autoHideTimer = setTimeout(() => {
        set({ visible: false, message: null });
        autoHideTimer = null;
      }, autoHideMs);
    }
  },
  hideTransition: () => {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    set({ visible: false, message: null });
  },
}));
