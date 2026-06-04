import { create } from 'zustand';
import type { CartItem } from '@aks/shared';

/**
 * Catalog-first cart for the customer mobile app. Mirrors
 * apps/customer-web/lib/cart.ts — every line is keyed by the catalog
 * item id; the snapshot `storeItemId` on the line is a hint only. The
 * matching engine picks the fulfilling store at order submit time
 * (cross-zone re-match in POST /orders, mode 2).
 *
 * Why no persist middleware here (yet): the customer-mobile cart was
 * never persisted historically and adding AsyncStorage now would
 * require a new dep + a Hermes-friendly storage adapter. Mobile carts
 * survive screen navigation in-process, which is what users actually
 * notice; cold-start hydration is on the follow-up list.
 */

/**
 * Cart line. Layered on top of the shared `CartItem` shape:
 *   * `itemId` — historically held the StoreItem id; we keep the field
 *     so legacy callers don't break (it's still a useful pre-order snapshot).
 *   * `catalogItemId` — NEW primary key. Used to dedupe on add and to
 *     POST to /orders. When missing (legacy callers), falls back to
 *     `itemId` so existing flows still work.
 */
export interface CartLine extends CartItem {
  catalogItemId?: string;
  /** Soft cap from the snapshot store. Engine re-validates on submit. */
  maxStock?: number;
}

/**
 * Cart-level recipient — same shape as customer-web's so the backend
 * payload is identical between surfaces.
 */
export interface CartRecipient {
  mode: 'self' | 'someone_else';
  name?: string;
  phone?: string;
  email?: string;
  existsInDb?: boolean;
  address?: {
    label: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
  };
}

interface CartState {
  items: CartLine[];
  recipient: CartRecipient;
  setRecipient: (next: CartRecipient) => void;
  addItem: (item: CartLine) => void;
  removeItem: (idemKey: string) => void;
  updateQty: (idemKey: string, qty: number) => void;
  clearCart: () => void;
  total: () => number;
}

/** Resolve the dedupe key for a line — catalog id when present, else
 *  the legacy itemId snapshot. Both removeItem/updateQty match against
 *  either so callers can pass whichever id they have during the
 *  transition. */
function keyFor(line: CartLine): string {
  return line.catalogItemId ?? line.itemId;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  recipient: { mode: 'self' },
  setRecipient: (next) => set({ recipient: next }),

  addItem: (newItem: CartLine) => {
    set((state) => {
      const incomingKey = keyFor(newItem);
      const existing = state.items.find((i) => keyFor(i) === incomingKey);
      if (existing) {
        return {
          items: state.items.map((i) =>
            keyFor(i) === incomingKey
              ? { ...i, qty: i.qty + newItem.qty }
              : i,
          ),
        };
      }
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (idemKey: string) => {
    set((state) => ({
      items: state.items.filter(
        (i) => keyFor(i) !== idemKey && i.itemId !== idemKey,
      ),
    }));
  },

  updateQty: (idemKey: string, qty: number) => {
    if (qty <= 0) {
      get().removeItem(idemKey);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        keyFor(i) === idemKey || i.itemId === idemKey ? { ...i, qty } : i,
      ),
    }));
  },

  clearCart: () => {
    set({ items: [], recipient: { mode: 'self' } });
  },

  total: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
}));
