import { create } from 'zustand';
import type { CartItem } from '@aks/shared';

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  updateQty: (itemId: string, qty: number) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],

  addItem: (newItem: CartItem) => {
    set((state) => {
      const existing = state.items.find((i) => i.itemId === newItem.itemId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.itemId === newItem.itemId ? { ...i, qty: i.qty + newItem.qty } : i
          ),
        };
      }
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (itemId: string) => {
    set((state) => ({
      items: state.items.filter((i) => i.itemId !== itemId),
    }));
  },

  updateQty: (itemId: string, qty: number) => {
    if (qty <= 0) {
      get().removeItem(itemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) => (i.itemId === itemId ? { ...i, qty } : i)),
    }));
  },

  clearCart: () => {
    set({ items: [] });
  },

  total: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
}));
