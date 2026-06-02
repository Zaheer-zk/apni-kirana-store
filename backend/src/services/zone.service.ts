// Zone lookups for order pricing + matching. Distinct from liveops zone
// helpers because we need the full Zone row (fees + commission), not just
// circles for point-in-zone tests.
//
// Per the 2026-06-02 design: every order is anchored to the zone containing
// the store. The matching engine already filters drivers by zone overlap;
// this service exposes the fee/commission columns so the order-create path
// uses zone-scoped pricing when available, and falls back to global
// PlatformSetting otherwise.

import { prisma } from '../config/prisma';
import { haversineDistance } from '../utils/geo';

export interface ZoneFees {
  zoneId: string;
  baseDeliveryFee: number;
  perKmFee: number;
  /** Stored as 0.10 = 10%. */
  commissionRate: number;
}

export interface ZoneRow extends ZoneFees {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

let cache: { value: ZoneRow[]; fetchedAt: number } | null = null;
const TTL_MS = 60_000;

async function loadZones(): Promise<ZoneRow[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  const rows = await prisma.zone.findMany({
    where: { isActive: true },
    select: {
      id: true,
      centerLat: true,
      centerLng: true,
      radiusKm: true,
      baseDeliveryFee: true,
      perKmFee: true,
      commissionRate: true,
    },
  });
  cache = {
    value: rows.map((r) => ({
      zoneId: r.id,
      centerLat: r.centerLat,
      centerLng: r.centerLng,
      radiusKm: r.radiusKm,
      baseDeliveryFee: r.baseDeliveryFee,
      perKmFee: r.perKmFee,
      commissionRate: r.commissionRate,
    })),
    fetchedAt: Date.now(),
  };
  return cache.value;
}

/** Reset cache — call after admin creates/edits/deletes a zone. */
export function invalidateZoneFeeCache(): void {
  cache = null;
}

/**
 * Return the (smallest-radius) active zone that contains (lat, lng), or null
 * if the point is outside every zone. Smallest-radius wins when zones
 * overlap so a specific neighbourhood zone takes precedence over a city
 * fallback zone.
 */
export async function findZoneForPoint(
  lat: number,
  lng: number,
): Promise<ZoneFees | null> {
  const zones = await loadZones();
  let best: ZoneRow | null = null;
  for (const z of zones) {
    const d = haversineDistance(lat, lng, z.centerLat, z.centerLng);
    if (d <= z.radiusKm) {
      if (!best || z.radiusKm < best.radiusKm) best = z;
    }
  }
  if (!best) return null;
  return {
    zoneId: best.zoneId,
    baseDeliveryFee: best.baseDeliveryFee,
    perKmFee: best.perKmFee,
    commissionRate: best.commissionRate,
  };
}

/**
 * Return EVERY active zone that contains (lat, lng) — useful for the
 * customer discovery side where overlap shouldn't suppress matches
 * (a customer at the corner of zone A + zone B should see stores from
 * both, not just the smaller one).
 */
export async function findZonesForPoint(
  lat: number,
  lng: number,
): Promise<ZoneRow[]> {
  const zones = await loadZones();
  return zones.filter(
    (z) => haversineDistance(lat, lng, z.centerLat, z.centerLng) <= z.radiusKm,
  );
}

/**
 * Filter a list of stores to those that fall inside the same zone(s) as
 * the customer's position. If the customer is outside every zone, returns
 * an empty list — there's no fallback because the whole point of the zone
 * model is "we don't deliver outside our serving area".
 */
export async function filterStoresByCustomerZone<
  T extends { lat: number; lng: number },
>(stores: T[], customerLat: number, customerLng: number): Promise<T[]> {
  const customerZones = await findZonesForPoint(customerLat, customerLng);
  if (customerZones.length === 0) return [];
  return stores.filter((s) =>
    customerZones.some(
      (z) => haversineDistance(s.lat, s.lng, z.centerLat, z.centerLng) <= z.radiusKm,
    ),
  );
}
