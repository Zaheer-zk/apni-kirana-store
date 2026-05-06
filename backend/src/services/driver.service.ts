import { prisma } from '../config/prisma';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { sendNotification } from './notification.service';
import { driverQueue } from '../queues/queues';

const DRIVER_SEARCH_RADIUS_KM = 5;
const DRIVER_ACCEPT_TIMEOUT_MS = 60 * 1000; // 60 seconds
const DRIVER_RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Driver assignment engine.
 * Finds the nearest ONLINE driver within DRIVER_SEARCH_RADIUS_KM of the store,
 * assigns them, and notifies them via FCM.
 * Retries (with the rejected driver excluded) if no driver accepts in 60 s.
 */
export async function assignDriverForOrder(
  orderId: string,
  excludeDriverIds: string[] = [],
): Promise<void> {
  // 1. Load order with store location
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { lat: true, lng: true } },
      customer: { select: { id: true } },
    },
  });

  if (!order || !['STORE_ACCEPTED', 'DRIVER_ASSIGNED'].includes(order.status)) return;

  const { lat, lng } = order.store;

  // 2. Bounding-box pre-filter
  const box = getBoundingBox(lat, lng, DRIVER_SEARCH_RADIUS_KM);

  // 3. Find ONLINE drivers within the bounding box, excluding already-tried drivers
  const candidates = await prisma.driver.findMany({
    where: {
      status: 'ONLINE',
      id: { notIn: excludeDriverIds },
      currentLat: { gte: box.minLat, lte: box.maxLat },
      currentLng: { gte: box.minLng, lte: box.maxLng },
    },
    include: { user: { select: { id: true } } },
  });

  // 4. No drivers available — notify customer and retry later
  if (candidates.length === 0) {
    await sendNotification(
      order.customer.id,
      'Finding a Driver',
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

  // 5. Sort by exact Haversine distance and pick the nearest
  const sorted = candidates
    .filter((d) => d.currentLat !== null && d.currentLng !== null)
    .map((d) => ({
      driver: d,
      distanceKm: haversineDistance(lat, lng, d.currentLat!, d.currentLng!),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (sorted.length === 0) {
    // All candidates had null coordinates — retry later
    await driverQueue.add(
      'retry-driver-assignment',
      { orderId, excludeDriverIds },
      { delay: DRIVER_RETRY_DELAY_MS },
    );
    return;
  }

  const { driver } = sorted[0]!;

  // 6. Assign driver and update order status
  await prisma.order.update({
    where: { id: orderId },
    data: {
      driverId: driver.id,
      status: 'DRIVER_ASSIGNED',
      driverAssignedAt: new Date(),
    },
  });

  // 7. Notify the driver
  await sendNotification(
    driver.user.id,
    'New Delivery',
    'You have been assigned a new delivery. Please accept it.',
    { orderId },
  );

  // 8. Enqueue a timeout job — if driver doesn't accept in 60 s, try the next driver
  await driverQueue.add(
    'driver-accept-timeout',
    { orderId, excludeDriverIds: [...excludeDriverIds, driver.id] },
    { delay: DRIVER_ACCEPT_TIMEOUT_MS },
  );
}
