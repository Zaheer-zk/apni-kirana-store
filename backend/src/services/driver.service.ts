// =====================================================================================
// Driver Assignment Engine — multi-driver broadcast, score-ranked, first-accept-wins.
//
// HOW IT WORKS
// ────────────
// 1. Order has a store (after STORE_ACCEPTED). Search for ONLINE drivers within radius.
// 2. Score each driver by:
//    a. Proximity to the store (closer = higher score)
//    b. Driver rating (better drivers slightly preferred)
//    c. Recency of last delivery (less idle = more reliable)
//    d. Final score = proximity*0.6 + rating*0.3 + freshness*0.1
// 3. Take TOP_N drivers (default 3) — these are the broadcast set
// 4. BROADCAST mode: notify all of them in parallel; first to accept gets the order
//    CASCADE mode:   pick best, give 60s, then try next on timeout/reject
//
// FIRST-ACCEPT-WINS
// ─────────────────
// When a driver taps Accept (PUT /drivers/orders/:id/accept):
// - Order's driverId is set to that driver
// - Status moves to DRIVER_ASSIGNED
// - Other broadcast drivers get a "missed it" notification
// - Driver app shows pickup screen with store address + items
// - On Pickup confirm → status PICKED_UP
// - On Delivery confirm with dropoffOtp → status DELIVERED
//
// PRIVACY
// ───────
// Driver order view (GET /drivers/orders/:id) omits customer name/phone.
// Only shown: pickup store + items + dropoff coords + total + payment method (COD flag).
// At delivery, driver enters the 4-digit dropoffOtp shown in the customer's app.
// =====================================================================================

import { prisma } from '../config/prisma';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { sendNotification } from './notification.service';
import { driverQueue } from '../queues/queues';
import { io } from '../socket';

const DRIVER_SEARCH_RADIUS_KM = 5;
const DRIVER_ACCEPT_TIMEOUT_MS = 60 * 1000;
const DRIVER_RETRY_DELAY_MS = 2 * 60 * 1000;
const TOP_N_BROADCAST = 3;

const DRIVER_MATCHING_MODE = (process.env.DRIVER_MATCHING_MODE ?? 'BROADCAST').toUpperCase() as
  | 'BROADCAST'
  | 'CASCADE';

interface ScoredDriver {
  driverId: string;
  userId: string;
  score: number;
  distanceKm: number;
  rating: number;
}

async function rankDrivers(
  orderId: string,
  excludeDriverIds: string[],
): Promise<{ scored: ScoredDriver[]; lat: number; lng: number; customerId: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { lat: true, lng: true } },
      customer: { select: { id: true } },
    },
  });
  if (!order || !['STORE_ACCEPTED', 'DRIVER_ASSIGNED'].includes(order.status)) return null;

  const { lat, lng } = order.store;
  const box = getBoundingBox(lat, lng, DRIVER_SEARCH_RADIUS_KM);

  const candidates = await prisma.driver.findMany({
    where: {
      status: 'ONLINE',
      id: { notIn: excludeDriverIds },
      currentLat: { gte: box.minLat, lte: box.maxLat },
      currentLng: { gte: box.minLng, lte: box.maxLng },
    },
    include: { user: { select: { id: true } } },
  });

  const scored: ScoredDriver[] = [];
  for (const d of candidates) {
    if (d.currentLat == null || d.currentLng == null) continue;
    const distanceKm = haversineDistance(lat, lng, d.currentLat, d.currentLng);
    if (distanceKm > DRIVER_SEARCH_RADIUS_KM) continue;

    const proximityScore = Math.max(0, 1 - distanceKm / DRIVER_SEARCH_RADIUS_KM);
    const ratingScore = (d.rating ?? 0) / 5;
    // Freshness placeholder — could be based on last delivery timestamp; default 1
    const freshnessScore = 1;
    const score = proximityScore * 0.6 + ratingScore * 0.3 + freshnessScore * 0.1;

    scored.push({ driverId: d.id, userId: d.user.id, score, distanceKm, rating: d.rating ?? 0 });
  }
  scored.sort((a, b) => b.score - a.score);
  return { scored, lat, lng, customerId: order.customer.id };
}

async function broadcastToDrivers(orderId: string, scored: ScoredDriver[]): Promise<void> {
  const top = scored.slice(0, TOP_N_BROADCAST);
  console.log(
    `[Driver] Broadcasting order ${orderId} to ${top.length} drivers: ` +
      top.map((d) => `${d.driverId.slice(-6)}(score=${d.score.toFixed(2)}, ${d.distanceKm.toFixed(1)}km)`).join(', '),
  );

  // Stash the broadcast set on the order so the accept endpoint can validate first-accept-wins
  // Reuse a free text field pattern (could be its own column later)
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const existingNotes = order?.notes ?? '';
  await prisma.order.update({
    where: { id: orderId },
    data: { notes: `${existingNotes}\n[DRIVER_BROADCAST:${top.map((d) => d.driverId).join(',')}]`.trim() },
  });

  await Promise.all(
    top.map(async (d) => {
      await sendNotification(
        d.userId,
        'New delivery offer',
        `Pickup ${d.distanceKm.toFixed(1)} km away. Tap to view & accept.`,
        { orderId, distanceKm: String(d.distanceKm) },
      );
      io?.to(`user:${d.userId}`).emit('order:assigned', {
        orderId, distanceKm: d.distanceKm, score: d.score,
      });
    }),
  );

  // Safety net: if nobody accepts, try wider set after timeout
  await driverQueue.add(
    'broadcast-driver-timeout',
    { orderId, excludeDriverIds: top.map((d) => d.driverId) },
    { delay: DRIVER_ACCEPT_TIMEOUT_MS * 2 },
  );
}

async function cascadeToBestDriver(
  orderId: string,
  scored: ScoredDriver[],
  excludeDriverIds: string[],
): Promise<void> {
  const best = scored[0]!;
  await prisma.order.update({
    where: { id: orderId },
    data: { driverId: best.driverId, status: 'DRIVER_ASSIGNED', driverAssignedAt: new Date() },
  });
  await sendNotification(
    best.userId,
    'New delivery',
    'You have been assigned a delivery. Accept within 60 seconds.',
    { orderId },
  );
  io?.to(`user:${best.userId}`).emit('order:assigned', { orderId });
  await driverQueue.add(
    'driver-accept-timeout',
    { orderId, excludeDriverIds: [...excludeDriverIds, best.driverId] },
    { delay: DRIVER_ACCEPT_TIMEOUT_MS },
  );
}

export async function assignDriverForOrder(
  orderId: string,
  excludeDriverIds: string[] = [],
): Promise<void> {
  const ranked = await rankDrivers(orderId, excludeDriverIds);
  if (!ranked) return;
  const { scored, customerId } = ranked;

  if (scored.length === 0) {
    await sendNotification(
      customerId,
      'Finding a driver',
      'We are looking for a driver near you. Please wait a moment.',
      { orderId },
    );
    await driverQueue.add(
      'retry-driver-assignment',
      { orderId, excludeDriverIds },
      { delay: DRIVER_RETRY_DELAY_MS },
    );
    return;
  }

  if (DRIVER_MATCHING_MODE === 'CASCADE') {
    await cascadeToBestDriver(orderId, scored, excludeDriverIds);
  } else {
    await broadcastToDrivers(orderId, scored);
  }
}

/** Notify other broadcast recipients that the order has been taken. */
export async function rescindDriverBroadcast(orderId: string, acceptedByDriverId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const match = order?.notes?.match(/\[DRIVER_BROADCAST:([^\]]+)\]/);
  if (!match) return;
  const broadcastIds = match[1]!.split(',');
  const rescinded = broadcastIds.filter((id) => id && id !== acceptedByDriverId);

  await prisma.order.update({
    where: { id: orderId },
    data: { notes: order!.notes!.replace(/\n?\[DRIVER_BROADCAST:[^\]]+\]/, '').trim() },
  });
  if (rescinded.length === 0) return;

  const drivers = await prisma.driver.findMany({
    where: { id: { in: rescinded } },
    include: { user: { select: { id: true } } },
  });
  await Promise.all(
    drivers.map((d) =>
      sendNotification(
        d.user.id,
        'Delivery taken',
        'Another driver accepted that offer. Stay online for the next one.',
        { orderId },
      ).then(() => io?.to(`user:${d.user.id}`).emit('order:rescinded', { orderId })),
    ),
  );
}
