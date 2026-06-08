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
import { sendNotification, notify, notifyAdmins } from './notification.service';
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
// Broadcast cap (admin-tunable via PlatformSetting.broadcastFanout).
// Eligible drivers above this number are LOGGED, not silently dropped.
// Driver accept timeout, retry delay, and matching mode are now read from
// PlatformSetting via getSettings() — see settings.service.ts. Cached
// in-process for ~5s so admin tweaks propagate without a backend restart.

// Hours since the driver's last delivery at which freshness saturates
// at 1.0. A driver who hasn't completed a delivery in this many hours
// is "fully fresh" — the engine prefers them to spread load. Drivers
// who JUST delivered get a low score (close to 0.4 floor) so the queue
// doesn't pick the same driver back-to-back when alternatives exist.
const FRESHNESS_SATURATION_HOURS = 2;
const FRESHNESS_FLOOR = 0.4;

interface ScoredDriver {
  driverId: string;
  userId: string;
  score: number;
  distanceKm: number;
  rating: number;
}

/** Earning estimate for a single driver leg = base + per-km × distance.
 *  Used in the broadcast/cascade notification body so the driver sees a
 *  real ₹ amount instead of the previous placeholder 0. Falls back to the
 *  zone's deliveryFee when one is set; otherwise the global default. */
async function estimateDriverEarning(args: {
  storeLat: number;
  storeLng: number;
  dropLat: number;
  dropLng: number;
}): Promise<number> {
  const { storeLat, storeLng, dropLat, dropLng } = args;
  const settings = await getSettings();
  const { findZoneForPoint } = await import('./zone.service');
  const zone = await findZoneForPoint(storeLat, storeLng);
  const baseFee = zone?.baseDeliveryFee ?? settings.baseDeliveryFee;
  const perKm = zone?.perKmFee ?? settings.perKmFee;
  const dist = haversineDistance(storeLat, storeLng, dropLat, dropLng);
  return Math.round(baseFee + perKm * dist);
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
  // Snapshot the request time once so every freshness calc uses the
  // same `now` — keeps the score deterministic within a single rank.
  // Avoids `new Date()` inside the loop which would let two drivers
  // with the same lastDeliveryAt score differently.
  const now = Date.now();

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
    // Freshness: 0..1 ramp from FRESHNESS_FLOOR (driver just delivered)
    // up to 1.0 (idle ≥ FRESHNESS_SATURATION_HOURS). Drivers with no
    // delivery history (never delivered) get 1.0 — they need the work
    // to build a track record. Driver.lastDeliveryAt is stamped by the
    // deliver endpoint (single + group).
    const lastDeliveryAt = (d as { lastDeliveryAt?: Date | null }).lastDeliveryAt;
    const freshnessScore = lastDeliveryAt
      ? Math.min(
          1,
          FRESHNESS_FLOOR +
            (1 - FRESHNESS_FLOOR) *
              Math.min(1, (now - lastDeliveryAt.getTime()) / (FRESHNESS_SATURATION_HOURS * 3_600_000)),
        )
      : 1;
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
  // Admin-tunable fanout cap. Above this we LOG (audit gap #5 — was
  // a silent slice).
  const fanout = (settings as { broadcastFanout?: number }).broadcastFanout ?? 30;
  const top = scored.slice(0, fanout);
  if (scored.length > fanout) {
    console.log(
      `[Driver] Capped broadcast fanout for order ${orderId}: ${scored.length} eligible → ${fanout} notified (PlatformSetting.broadcastFanout)`,
    );
  }
  console.log(
    `[Driver] Broadcasting order ${orderId} to ${top.length} drivers: ` +
      top.map((d) => `${d.driverId.slice(-6)}(score=${d.score.toFixed(2)}, ${d.distanceKm.toFixed(1)}km)`).join(', '),
  );

  // Stash the broadcast set in the dedicated driverBroadcast column
  // (replaced the [DRIVER_BROADCAST:...] regex stash in Order.notes
  // which collided with the customer notes field and was error-prone
  // to parse).
  await prisma.order.update({
    where: { id: orderId },
    data: { driverBroadcast: top.map((d) => d.driverId) },
  });

  // Compute the real earning estimate once per order — every driver
  // sees the same number for the same offer (audit gap #4: was
  // placeholder 0).
  const orderForFee = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { lat: true, lng: true } },
      deliveryAddress: { select: { lat: true, lng: true } },
    },
  });
  const earning =
    orderForFee?.store && orderForFee.deliveryAddress
      ? await estimateDriverEarning({
          storeLat: orderForFee.store.lat,
          storeLng: orderForFee.store.lng,
          dropLat: orderForFee.deliveryAddress.lat,
          dropLng: orderForFee.deliveryAddress.lng,
        })
      : 0;

  await Promise.all(
    top.map(async (d) => {
      await notify('DRIVER_NEW_DELIVERY', d.userId, {
        orderId,
        orderShort: orderId.slice(-6),
        distanceKm: d.distanceKm.toFixed(1),
        earning,
      });
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
  // Multi-store group: fan the assignment to every sibling leg so the
  // same driver handles all pickups + the single delivery. No-op for
  // single-store orders (helper checks `orderGroupId` itself).
  const { assignDriverToGroup } = await import('./order-group.service');
  await assignDriverToGroup(prisma, orderId, best.driverId);
  // Cascade mode = single assignment. Same earning-estimate path as
  // broadcast so the driver sees a real ₹ amount, not 0.
  const orderForFee = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { lat: true, lng: true } },
      deliveryAddress: { select: { lat: true, lng: true } },
    },
  });
  const earning =
    orderForFee?.store && orderForFee.deliveryAddress
      ? await estimateDriverEarning({
          storeLat: orderForFee.store.lat,
          storeLng: orderForFee.store.lng,
          dropLat: orderForFee.deliveryAddress.lat,
          dropLng: orderForFee.deliveryAddress.lng,
        })
      : 0;
  await notify('DRIVER_NEW_DELIVERY', best.userId, {
    orderId,
    orderShort: orderId.slice(-6),
    distanceKm: best.distanceKm.toFixed(1),
    earning,
  });
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
  const maxRetries =
    (settings as { matchingMaxRetries?: number }).matchingMaxRetries ?? 5;

  if (scored.length === 0) {
    // Retry cap: previously this branch self-re-enqueued forever +
    // pinged the customer every loop with no eventual resolution.
    // Now we increment a counter; once it crosses maxRetries we
    // notify admin so they can rescue (manually assign a driver
    // from the order-detail page) and stop the auto-retry loop.
    const orderRow = await prisma.order.findUnique({
      where: { id: orderId },
      select: { matchingRetryCount: true },
    });
    const nextRetryCount = (orderRow?.matchingRetryCount ?? 0) + 1;
    await prisma.order.update({
      where: { id: orderId },
      data: { matchingRetryCount: nextRetryCount },
    });
    if (nextRetryCount >= maxRetries) {
      console.log(
        `[Driver] Retry cap reached for order ${orderId} (${nextRetryCount}/${maxRetries}); notifying admin, no further auto-retries.`,
      );
      // One-time customer note + admin fan-out.
      await sendNotification(
        customerId,
        'Driver search exhausted',
        'No driver picked up your order. Our team has been notified and will reach out.',
        { orderId },
      );
      await notifyAdmins('ADMIN_ORDER_PLACED', {
        orderShort: orderId.slice(-6),
        orderId,
        attempts: nextRetryCount,
      }).catch((err) => console.warn('[Driver] admin notify failed:', err));
      return;
    }
    await sendNotification(
      customerId,
      'Finding a driver',
      'We are looking for a driver near you. Please wait a moment.',
      { orderId },
    );
    await driverQueue.add(
      'retry-driver-assignment',
      { orderId, excludeDriverIds },
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
  // Read from the dedicated driverBroadcast column (was a regex on
  // free-text Order.notes pre-2026-06-08, which corrupted customer
  // notes and broke on parse errors).
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { driverBroadcast: true, notes: true },
  });
  const broadcastIds = order?.driverBroadcast ?? [];
  if (broadcastIds.length === 0) return;
  const rescinded = broadcastIds.filter((id) => id && id !== acceptedByDriverId);

  // Clear the dedicated column so a re-broadcast can repopulate. Also
  // scrub any legacy [DRIVER_BROADCAST:...] string left in
  // Order.notes from before the column existed — best-effort, never
  // fails the rescind on a notes-write error.
  const cleanedNotes = order?.notes
    ? order.notes.replace(/\n?\[DRIVER_BROADCAST:[^\]]+\]/, '').trim()
    : null;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      driverBroadcast: [],
      ...(cleanedNotes !== order?.notes ? { notes: cleanedNotes } : {}),
    },
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
