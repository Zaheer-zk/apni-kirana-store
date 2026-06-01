'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Cart for B2B restock orders on the store-web. Mirrors the mobile store
// (apps/store-portal/store/restock-cart.store.ts). The buyer picks catalog
// items only — the backend matching engine selects the best in-range
// wholesaler at order-placement time, so prices live there, not here.
//
// Persisted to localStorage so a half-built cart survives a refresh.

export interface RestockCartItem {
  catalogItemId: string;
  name: string;
  unit: string;
  category: string;
  imageUrl: string | null;
  qty: number;
}

interface RestockCartState {
  items: Record<string, RestockCartItem>; // keyed by catalogItemId
  setQty: (item: Omit<RestockCartItem, 'qty'>, qty: number) => void;
  clear: () => void;
}

export const useRestockCart = create<RestockCartState>()(
  persist(
    (set) => ({
      items: {},
      setQty: (item, qty) =>
        set((s) => {
          const items = { ...s.items };
          if (qty <= 0) {
            delete items[item.catalogItemId];
          } else {
            items[item.catalogItemId] = { ...item, qty };
          }
          return { items };
        }),
      clear: () => set({ items: {} }),
    }),
    {
      name: 'aks-store-restock-cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function restockCartList(items: Record<string, RestockCartItem>): RestockCartItem[] {
  return Object.values(items);
}

export function restockCartCount(items: Record<string, RestockCartItem>): number {
  return Object.values(items).reduce((n, i) => n + i.qty, 0);
}
