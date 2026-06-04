'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Catalog-first cart for the customer web app.
 *
 * Why catalog-first (and not store-first as the v1/v2 schema was):
 *   The user doesn't think in terms of stores when they shop — they
 *   think "Aloo Bhujia, 5-Star, sugar 1kg". Two stores can carry the
 *   same Aloo Bhujia at different prices, and forcing the customer to
 *   pick "T-and-J or Divine Gems" before they add the item just makes
 *   them work harder and limits cross-store baskets.
 *
 *   So the cart is keyed by `catalogItemId`. The matching engine picks
 *   which store(s) fulfil the order at submit time (the cross-zone
 *   re-match in POST /orders + the `/orders/preview` endpoint).
 *
 *   `storeItemId` is still stored on each line as a HINT — the
 *   StoreItem row that was the best offer when the customer tapped
 *   Add. Used for the back-link "more from this store" UX and for the
 *   price/image snapshot. Order creation IGNORES it and sends
 *   `catalogItemId + qty` so the engine is free to re-route.
 *
 * Why persist: refreshing the page or coming back tomorrow shouldn't
 * lose the cart. `zustand/middleware/persist` writes to localStorage
 * under `aks-customer-cart` and rehydrates on mount.
 */
export interface CartLine {
  /** CatalogItem.id — the cart's primary key. */
  catalogItemId: string;
  /** Best-offer StoreItem.id at add time. Snapshot only — engine may
   *  re-route to a different store at order time. */
  storeItemId?: string;
  /** Display name from CatalogItem.name. */
  name: string;
  /** Customer-facing price snapshot in rupees (= storeItem.price +
   *  adminMargin). Backend recomputes canonical totals at order time. */
  price: number;
  /** Pack size text — "1 kg", "500 g", "1 L". */
  unit: string;
  /** Optional thumbnail. */
  imageUrl?: string | null;
  /** Quantity (whole units). */
  qty: number;
  /** Best-offer stock at add time. Soft guard rail — engine re-validates
   *  on order submit. Set to 0 / undefined for catalog-only adds. */
  maxStock?: number;
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
  items: CartLine[];
  /** Cart-level recipient — see {@link CartRecipient}. Defaults to self. */
  recipient: CartRecipient;
  setRecipient: (next: CartRecipient) => void;

  /** Items count (sum of quantities). */
  itemCount: () => number;
  /** Subtotal in rupees (no delivery / discount). */
  subtotal: () => number;

  /**
   * Add an item to the cart. Deduplicates by `catalogItemId` — adding
   * the "same product from a different store" just bumps the qty on
   * the existing line and keeps the original storeItemId/price snapshot.
   * Returns 'added' on first add, 'bumped' if the qty was incremented.
   */
  add: (line: Omit<CartLine, 'qty'> & { qty?: number }) => 'added' | 'bumped';

  /** Adjust quantity for a catalog item. qty<=0 removes the line. */
  setQty: (catalogItemId: string, qty: number) => void;
  remove: (catalogItemId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      // Default to self so existing checkout flows keep working without
      // surfacing the "for someone else" choice unless the customer flips it.
      recipient: { mode: 'self' },
      setRecipient: (next) => set({ recipient: next }),

      itemCount: () => get().items.reduce((sum, l) => sum + l.qty, 0),
      subtotal: () => get().items.reduce((sum, l) => sum + l.price * l.qty, 0),

      add: (line) => {
        const state = get();
        const desiredQty = Math.max(1, line.qty ?? 1);
        const existing = state.items.find(
          (l) => l.catalogItemId === line.catalogItemId,
        );
        if (existing) {
          const cap = line.maxStock ?? existing.maxStock;
          const nextQty = cap
            ? Math.min(existing.qty + desiredQty, cap)
            : existing.qty + desiredQty;
          set({
            items: state.items.map((l) =>
              l.catalogItemId === line.catalogItemId
                ? { ...l, qty: nextQty }
                : l,
            ),
          });
          return 'bumped';
        }
        set({ items: [...state.items, { ...line, qty: desiredQty }] });
        return 'added';
      },

      setQty: (catalogItemId, qty) => {
        if (qty <= 0) {
          get().remove(catalogItemId);
          return;
        }
        set((state) => ({
          items: state.items.map((l) =>
            l.catalogItemId === catalogItemId
              ? { ...l, qty: l.maxStock ? Math.min(qty, l.maxStock) : qty }
              : l,
          ),
        }));
      },

      remove: (catalogItemId) => {
        set((state) => ({
          items: state.items.filter((l) => l.catalogItemId !== catalogItemId),
        }));
      },

      clear: () => set({ items: [], recipient: { mode: 'self' } }),
    }),
    {
      name: 'aks-customer-cart',
      storage: createJSONStorage(() => localStorage),
      // v3 dropped the single-store constraint and re-keyed lines by
      // catalogItemId. v1 → v3 migration:
      //   * adds recipient: { mode: 'self' } (v2 change)
      //   * dedupes any line with no catalogItemId out of the cart
      //   * drops the legacy `store` field
      // Old v1 carts that still have storeItemId-only lines without a
      // catalogItemId hint can't be migrated — those lines are dropped
      // (the user can re-add). Acceptable; the legacy field was always
      // populated alongside storeItemId so this is rare in practice.
      version: 3,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted;
        const next = persisted as {
          items?: Array<Partial<CartLine>>;
          recipient?: CartRecipient;
          store?: unknown;
        };
        if (version < 2) {
          next.recipient = { mode: 'self' };
        }
        if (version < 3) {
          // Drop the legacy single-store anchor.
          delete next.store;
          // Drop lines that pre-date the catalogItemId field.
          if (Array.isArray(next.items)) {
            next.items = next.items.filter((l) => !!l.catalogItemId);
          }
        }
        return next;
      },
    },
  ),
);
