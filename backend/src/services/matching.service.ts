import { prisma } from '../config/prisma';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { sendNotification } from './notification.service';
import { matchingQueue } from '../queues/queues';

const MIN_ITEM_MATCH_PERCENT = 0.8;
const STORE_RETRY_DELAY_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Store matching engine.
 * Finds the best ACTIVE + isOpen store that can fulfill the order items,
 * assigns the order, and notifies the store owner.
 * If no match is found the order is cancelled and the customer is notified.
 */
export async function matchStoreForOrder(
  orderId: string,
  excludeStoreIds: string[] = [],
): Promise<void> {
  // 1. Load order with items and delivery address coordinates
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      deliveryAddress: { select: { lat: true, lng: true } },
      customer: { select: { id: true } },
    },
  });

  if (!order || order.status !== 'PENDING') return;

  const { lat, lng } = order.deliveryAddress;
  const totalItems = order.items.length;

  // 2. Bounding-box pre-filter (default search radius 5 km)
  const box = getBoundingBox(lat, lng, 5);

  // 3. Query candidate stores
  const candidateStores = await prisma.store.findMany({
    where: {
      status: 'ACTIVE',
      isOpen: true,
      id: { notIn: excludeStoreIds },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    include: { items: true, owner: { select: { id: true } } },
  });

  // 4. Score each candidate
  interface ScoredStore {
    storeId: string;
    ownerId: string;
    score: number;
    distanceKm: number;
  }

  const scored: ScoredStore[] = [];

  for (const store of candidateStores) {
    const distanceKm = haversineDistance(lat, lng, store.lat, store.lng);

    // Count how many order items this store can fulfill (name match + available + stock)
    const matchedItems = order.items.filter((orderItem) =>
      store.items.some(
        (storeItem) =>
          storeItem.name.toLowerCase() === orderItem.name.toLowerCase() &&
          storeItem.isAvailable &&
          storeItem.stockQty > 0,
      ),
    ).length;

    const matchRatio = matchedItems / totalItems;
    if (matchRatio < MIN_ITEM_MATCH_PERCENT) continue;

    // Score: match ratio weighted with proximity (inverse distance, floor at 0.1 km)
    const proximityScore = 1 / Math.max(distanceKm, 0.1);
    const score = matchRatio * 0.7 + proximityScore * 0.3;

    scored.push({ storeId: store.id, ownerId: store.owner.id, score, distanceKm });
  }

  // 5. No suitable store found
  if (scored.length === 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelReason: 'No nearby store can fulfill your order' },
    });

    await sendNotification(
      order.customer.id,
      'Order Cancelled',
      'Sorry, no nearby store could fulfill your order at this time.',
    );
    return;
  }

  // 6. Pick the best store
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;

  // 7. Assign order to best store
  await prisma.order.update({
    where: { id: orderId },
    data: { storeId: best.storeId },
  });

  // 8. Notify the store owner
  await sendNotification(
    best.ownerId,
    'New Order',
    'You have received a new order. Please review and accept it.',
    { orderId },
  );

  // 9. Enqueue a retry job in case the store does not respond within 3 minutes
  await matchingQueue.add(
    'retry-store-match',
    { orderId, excludeStoreIds: [...excludeStoreIds, best.storeId] },
    { delay: STORE_RETRY_DELAY_MS },
  );
}
