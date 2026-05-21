import { create } from 'zustand';

// Cart for B2B restock orders. The buyer picks catalog items; the backend
// matching engine chooses the best in-range wholesaler — so the cart holds
// catalog items only (no wholesaler, no price until the order is placed).

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

export const useRestockCart = create<RestockCartState>((set) => ({
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
}));

export function restockCartList(items: Record<string, RestockCartItem>): RestockCartItem[] {
  return Object.values(items);
}

export function restockCartCount(items: Record<string, RestockCartItem>): number {
  return Object.values(items).reduce((n, i) => n + i.qty, 0);
}
