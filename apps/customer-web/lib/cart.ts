'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Single-store cart for the customer web app.
 *
 * Why single-store: customers order from ONE store at a time. The matching
 * engine assumes every line item belongs to the same store; mixing stores
 * would break delivery routing. If the customer adds an item from a
 * different store, the UI prompts "Switch store?" and `replaceStore()`
 * clears the cart before adding.
 *
 * Why persist: refreshing the page or coming back tomorrow shouldn't lose
 * the cart. `zustand/middleware/persist` writes to localStorage under
 * `aks-customer-cart` and rehydrates on mount.
 */
export interface CartLine {
  /** StoreItem.id — what gets POSTed to `/orders`. */
  storeItemId: string;
  /** Catalog item id (for product-detail navigation). */
  catalogItemId: string;
  /** Display name from CatalogItem.name. */
  name: string;
  /** Selling price in rupees (from StoreItem.price). */
  price: number;
  /** Pack size text — "1 kg", "500 g", "1 L". */
  unit: string;
  /** Optional thumbnail. */
  imageUrl?: string | null;
  /** Quantity (whole units). */
  qty: number;
  /** Max stock the store has — guard rail for the qty + button. */
  maxStock: number;
}

export interface CartStoreContext {
  storeId: string;
  storeName: string;
  storeImageUrl?: string | null;
  /** Optional delivery estimate (minutes). */
  etaMinutes?: number;
}

/**
 * Cart-level "who is this order for?" decision. Set on the cart screen
 * before checkout so we can search store + driver against the actual
 * dropoff zone — see backend POST /orders/preview.
 *
 *  - mode='self'         → checkout uses one of the customer's saved
 *                          addresses (existing behaviour).
 *  - mode='someone_else' → recipient is a different person; their
 *                          address is collected inline and posted to
 *                          POST /orders as `recipientAddress`.
 */
export interface CartRecipient {
  mode: 'self' | 'someone_else';
  name?: string;
  phone?: string;
  email?: string;
  /** Whether the recipient phone matches an existing customer account. */
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
  store: CartStoreContext | null;
  items: CartLine[];
  /** Cart-level recipient — see {@link CartRecipient}. Defaults to self. */
  recipient: CartRecipient;
  setRecipient: (next: CartRecipient) => void;

  /** Items count (sum of quantities). */
  itemCount: () => number;
  /** Subtotal in rupees (no delivery / discount). */
  subtotal: () => number;

  /** Try to add an item. Returns the action the UI should take:
   *  - `added` — item was added (same store or empty cart)
   *  - `bumped` — already in cart, qty was incremented
   *  - `conflict` — a different store's cart is active; UI must prompt
   */
  add: (
    store: CartStoreContext,
    line: Omit<CartLine, 'qty'> & { qty?: number },
  ) => 'added' | 'bumped' | 'conflict';

  /** Force-replace the active store + first line. Use after a confirmed
   *  "Switch store" prompt. */
  replaceStore: (
    store: CartStoreContext,
    line: Omit<CartLine, 'qty'> & { qty?: number },
  ) => void;

  setQty: (storeItemId: string, qty: number) => void;
  remove: (storeItemId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      store: null,
      items: [],
      // Default to self so existing checkout flows keep working without
      // surfacing the "for someone else" choice unless the customer flips it.
      recipient: { mode: 'self' },
      setRecipient: (next) => set({ recipient: next }),

      itemCount: () => get().items.reduce((sum, l) => sum + l.qty, 0),
      subtotal: () => get().items.reduce((sum, l) => sum + l.price * l.qty, 0),

      add: (store, line) => {
        const state = get();
        const desiredQty = Math.max(1, line.qty ?? 1);

        // Different store + non-empty cart → caller must confirm.
        if (state.store && state.store.storeId !== store.storeId && state.items.length > 0) {
          return 'conflict';
        }

        const existing = state.items.find((l) => l.storeItemId === line.storeItemId);
        if (existing) {
          const nextQty = Math.min(existing.qty + desiredQty, line.maxStock || existing.qty + desiredQty);
          set({
            store: state.store ?? store,
            items: state.items.map((l) =>
              l.storeItemId === line.storeItemId ? { ...l, qty: nextQty } : l,
            ),
          });
          return 'bumped';
        }

        set({
          store: state.store ?? store,
          items: [...state.items, { ...line, qty: desiredQty }],
        });
        return 'added';
      },

      replaceStore: (store, line) => {
        const desiredQty = Math.max(1, line.qty ?? 1);
        set({
          store,
          items: [{ ...line, qty: desiredQty }],
        });
      },

      setQty: (storeItemId, qty) => {
        if (qty <= 0) {
          get().remove(storeItemId);
          return;
        }
        set((state) => ({
          items: state.items.map((l) =>
            l.storeItemId === storeItemId
              ? { ...l, qty: Math.min(qty, l.maxStock || qty) }
              : l,
          ),
        }));
      },

      remove: (storeItemId) => {
        set((state) => {
          const next = state.items.filter((l) => l.storeItemId !== storeItemId);
          return {
            items: next,
            store: next.length === 0 ? null : state.store,
          };
        });
      },

      clear: () => set({ store: null, items: [], recipient: { mode: 'self' } }),
    }),
    {
      name: 'aks-customer-cart',
      storage: createJSONStorage(() => localStorage),
      // v2 added the recipient field; legacy v1 carts hydrate without it,
      // so migration coerces missing recipient → { mode: 'self' }.
      version: 2,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted;
        if (version < 2) {
          (persisted as { recipient?: CartRecipient }).recipient = { mode: 'self' };
        }
        return persisted;
      },
    },
  ),
);
