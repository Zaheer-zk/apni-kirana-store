// Per-order stock movements. Centralised so the same accept/cancel logic
// is used everywhere — order-accept, admin cancel, customer cancel — and
// nobody forgets to keep StoreItem.stockQty in sync with what's actually
// promised to customers.
//
// Decrement timing
// ----------------
// We commit stock when the STORE ACCEPTS the order (not at create time).
// Rationale:
//   * The matching engine can re-route an unaccepted order to a different
//     store; decrementing at create would leave the original store with
//     phantom holds for every order that bounced.
//   * Two simultaneous customers can both place PENDING orders for the
//     same last unit. The atomic decrement at accept time uses a
//     conditional updateMany — the second store to attempt accept gets a
//     stock failure and returns 409 to its UI, which is the correct
//     behaviour (whoever clicked Accept first gets the unit).
//
// Reverting on cancel
// -------------------
// Only revert when the order's PRIOR status was one we'd already
// decremented from (STORE_ACCEPTED / COOKING / DRIVER_ASSIGNED / PICKED_UP).
// PENDING → CANCELLED never touched stock, so no revert. DELIVERED orders
// keep their decrement (the item really left the shelf).
//
// Idempotency
// -----------
// Both helpers are NOT idempotent by themselves — callers MUST gate them on
// state transitions (e.g. "only call decrement when transitioning PENDING
// → STORE_ACCEPTED"). The accept endpoint does this via the prior-status
// check on the order row.

import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Sentinel thrown by `decrementStockForOrder` when at least one line item
 * doesn't have enough stock. Callers should map this to a 409 (resource
 * conflict) so the store-portal can surface "Update your inventory then
 * accept again."
 */
export class InsufficientStockError extends Error {
  public readonly itemName: string;
  constructor(itemName: string) {
    super(`Insufficient stock for ${itemName}`);
    this.itemName = itemName;
    this.name = 'InsufficientStockError';
  }
}

/**
 * Atomically decrement every line item's StoreItem.stockQty by its ordered
 * qty. Uses conditional updateMany (`stockQty: { gte: qty }`) so two
 * accept requests racing for the same last unit can't both succeed —
 * Postgres serialises the updates and the loser sees `count === 0`.
 *
 * Throws InsufficientStockError on the first line that can't be decremented.
 * The caller is expected to run this inside `prisma.$transaction` so a
 * partial failure rolls back any prior decrements in the same accept.
 */
export async function decrementStockForOrder(
  tx: Tx,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { items: { select: { itemId: true, name: true, qty: true } } },
  });
  if (!order) return;
  for (const line of order.items) {
    if (!line.itemId) continue; // legacy orders without a StoreItem link
    const result = await tx.storeItem.updateMany({
      where: { id: line.itemId, stockQty: { gte: line.qty } },
      data: { stockQty: { decrement: line.qty } },
    });
    if (result.count === 0) {
      throw new InsufficientStockError(line.name ?? 'item');
    }
  }
}

/**
 * Add the ordered qty back to every line item's StoreItem.stockQty. Only
 * call after verifying the order's prior status was one for which
 * decrement had already run.
 *
 * Never throws on missing rows — a deleted StoreItem (catalog cleanup
 * after order was placed) silently skips that line. The order is already
 * cancelled at this point; logging it would just add noise.
 */
export async function incrementStockForOrder(
  tx: Tx,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { items: { select: { itemId: true, qty: true } } },
  });
  if (!order) return;
  for (const line of order.items) {
    if (!line.itemId) continue;
    await tx.storeItem.updateMany({
      where: { id: line.itemId },
      data: { stockQty: { increment: line.qty } },
    });
  }
}

/**
 * True for statuses where stock has already been decremented (i.e. cancel
 * must revert). Mirrors `decrementStockForOrder`'s timing: anything past
 * STORE_ACCEPTED is "stock spoken for". DELIVERED is excluded because the
 * sale is real and we DON'T add the units back even though the order is
 * terminal.
 */
export function statusHadStockDecrement(status: string): boolean {
  return (
    status === 'STORE_ACCEPTED' ||
    status === 'COOKING' ||
    status === 'DRIVER_ASSIGNED' ||
    status === 'PICKED_UP'
  );
}
