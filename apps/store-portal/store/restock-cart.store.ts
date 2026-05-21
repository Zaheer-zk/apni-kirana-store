import { create } from 'zustand';

// Cart for B2B restock orders — a store owner buying stock from one wholesaler.
// A cart only ever holds items from a single wholesaler; switching wholesaler
// resets it.

export interface RestockCartItem {
  storeItemId: string;
  name: string;
  unit: string;
  price: number;
  imageUrl: string | null;
  stockQty: number; // quantity the wholesaler has available
  qty: number; // quantity the buyer wants
}

interface RestockCartState {
  wholesalerId: string | null;
  wholesalerName: string | null;
  items: Record<string, RestockCartItem>;
  /** Call when opening a wholesaler. Resets the cart if it's a different wholesaler. */
  enterWholesaler: (id: string, name: string) => void;
  setQty: (item: Omit<RestockCartItem, 'qty'>, qty: number) => void;
  clear: () => void;
}

export const useRestockCart = create<RestockCartState>((set) => ({
  wholesalerId: null,
  wholesalerName: null,
  items: {},

  enterWholesaler: (id, name) =>
    set((s) =>
      s.wholesalerId === id
        ? { wholesalerName: name }
        : { wholesalerId: id, wholesalerName: name, items: {} },
    ),

  setQty: (item, qty) =>
    set((s) => {
      const items = { ...s.items };
      if (qty <= 0) {
        delete items[item.storeItemId];
      } else {
        items[item.storeItemId] = { ...item, qty: Math.min(qty, item.stockQty) };
      }
      return { items };
    }),

  clear: () => set({ wholesalerId: null, wholesalerName: null, items: {} }),
}));

export function restockCartList(items: Record<string, RestockCartItem>): RestockCartItem[] {
  return Object.values(items);
}

export function restockCartCount(items: Record<string, RestockCartItem>): number {
  return Object.values(items).reduce((n, i) => n + i.qty, 0);
}

export function restockCartSubtotal(items: Record<string, RestockCartItem>): number {
  return Object.values(items).reduce((s, i) => s + i.price * i.qty, 0);
}
