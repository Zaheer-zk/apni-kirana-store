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
import { getSettings } from './settings.service';

// 25km is the OUTER bounding-box prefilter — keeps the candidate scan
// cheap by ignoring drivers nowhere near the order. It is intentionally
// large because zone filtering downstream is the authoritative test for
// "can this driver serve this order". Used to be 5km which silently
// killed any driver further than 5km from the store, even if their
// selected zone covered the store (e.g. driver finishing a previous
// drop on the far edge of the zone). The prefilter no longer rejects
// anyone — `inZone` below is the only relevance check.
const DRIVER_SEARCH_RADIUS_KM = 25;
// Broadcast cap. Per product spec we notify EVERY driver whose selected
// zones contain the order's store OR drop-off, not just the top 3 scored.
// First to accept wins. The number here is a hard safety ceiling for
// dense cities — in practice the eligible set is usually under 10
// (zone filter + 5km radius + ONLINE status all narrow it heavily).
const TOP_N_BROADCAST = 30;
// Driver accept timeout, retry delay, and matching mode are now read from
// PlatformSetting via getSettings() — see settings.service.ts. Cached
// in-process for ~5s so admin tweaks propagate without a backend restart.

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
      deliveryAddress: { select: { lat: true, lng: true } },
    },
  });
  if (!order || !['STORE_ACCEPTED', 'DRIVER_ASSIGNED'].includes(order.status)) return null;

  const { lat, lng } = order.store;

  // Bounding-box prefilter radius derived from the LARGEST active zone
  // radius (with a small buffer). This way, however big any admin makes a
  // zone — 20km, 50km, whatever — the engine widens the candidate scan
  // automatically. Zones are the source of truth; no hardcoded km values
  // drive matching anymore. Falls back to a sensible default only if there
  // are zero zones in the DB.
  const maxZoneRow = await prisma.zone.aggregate({
    where: { isActive: true },
    _max: { radiusKm: true },
  });
  const bboxRadiusKm = Math.max(DRIVER_SEARCH_RADIUS_KM, maxZoneRow._max.radiusKm ?? 0);
  const box = getBoundingBox(lat, lng, bboxRadiusKm);

  // Pull each candidate's zone set so we can apply the zone filter below.
  // Drivers with zero zones serve the whole city (backward compat for
  // drivers registered before zone selection existed).
  const candidates = await prisma.driver.findMany({
    where: {
      status: 'ONLINE',
      id: { notIn: excludeDriverIds },
      currentLat: { gte: box.minLat, lte: box.maxLat },
      currentLng: { gte: box.minLng, lte: box.maxLng },
    },
    include: {
      user: { select: { id: true } },
      zones: {
        include: {
          zone: { select: { centerLat: true, centerLng: true, radiusKm: true } },
        },
      },
    },
  });

  const scored: ScoredDriver[] = [];
  const dropReasons: Record<string, number> = {};
  const drop = (r: string) => {
    dropReasons[r] = (dropReasons[r] ?? 0) + 1;
  };
  for (const d of candidates) {
    if (d.currentLat == null || d.currentLng == null) {
      drop('no_gps');
      continue;
    }
    const distanceKm = haversineDistance(lat, lng, d.currentLat, d.currentLng);

    // Zone filter: drivers MUST opt into at least one zone to receive
    // offers, and the order's store OR drop-off must fall inside one
    // of those zones. This is the AUTHORITATIVE relevance test —
    // physical distance from the store is captured by the zone's own
    // radiusKm, so we don't second-guess it with an extra haversine cap.
    if (d.zones.length === 0) {
      drop('no_zones');
      continue;
    }
    const inZone = d.zones.some(({ zone }) => {
      const dStore = haversineDistance(zone.centerLat, zone.centerLng, lat, lng);
      const dDrop = haversineDistance(
        zone.centerLat,
        zone.centerLng,
        order.deliveryAddress.lat,
        order.deliveryAddress.lng,
      );
      return dStore <= zone.radiusKm || dDrop <= zone.radiusKm;
    });
    if (!inZone) {
      drop('zone_mismatch');
      continue;
    }

    const proximityScore = Math.max(0, 1 - distanceKm / DRIVER_SEARCH_RADIUS_KM);
    const ratingScore = (d.rating ?? 0) / 5;
    // Freshness placeholder — could be based on last delivery timestamp; default 1
    const freshnessScore = 1;
    const score = proximityScore * 0.6 + ratingScore * 0.3 + freshnessScore * 0.1;

    scored.push({ driverId: d.id, userId: d.user.id, score, distanceKm, rating: d.rating ?? 0 });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log(
    `[Driver] rankDrivers order=${orderId.slice(-6)}: ${candidates.length} candidates in bbox, ` +
      `${scored.length} matched. Drops: ${
        Object.entries(dropReasons)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ') || 'none'
      }`,
  );
  return { scored, lat, lng, customerId: order.customer.id };
}

async function broadcastToDrivers(orderId: string, scored: ScoredDriver[]): Promise<void> {
  const settings = await getSettings();
  const DRIVER_ACCEPT_TIMEOUT_MS = settings.driverAcceptTimeoutSeconds * 1000;
  // Notify EVERY zone-matched driver (no top-N slice). Zones already
  // narrow the eligible set; capping at N here would silently drop
  // qualifying drivers in dense zones. The 30 ceiling is kept only as a
  // safety net against truly pathological cases (e.g. an admin creates
  // a 100km zone with 200 online drivers); under normal operation the
  // eligible set is well below 30.
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
  const settings = await getSettings();
  const DRIVER_ACCEPT_TIMEOUT_MS = settings.driverAcceptTimeoutSeconds * 1000;
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

  const settings = await getSettings();

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
      // Re-search after twice the per-driver accept window
      { delay: settings.driverAcceptTimeoutSeconds * 2 * 1000 },
    );
    return;
  }

  if (settings.driverMatchingMode === 'CASCADE') {
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
