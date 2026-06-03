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
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

/**
 * Zone annotated with its position relative to a reference point — used by the
 * admin assignment UI so candidate stores / drivers can show "in order zone"
 * vs "nearest fallback zone #2", etc.
 */
export interface RankedZone extends ZoneRow {
  /** Great-circle distance from the reference point to the zone center. */
  distanceKm: number;
  /** True if the reference point lies inside this zone. */
  containsPoint: boolean;
  /**
   * 0 for the order's own zone(s); 1..N for the 1st/2nd/Nth nearest fallback
   * zone when the primary zone has no candidates. Mirrors what we surface
   * in the admin assign-store / assign-driver dialogs.
   */
  rank: number;
}

let cache: { value: ZoneRow[]; fetchedAt: number } | null = null;
const TTL_MS = 60_000;

async function loadZones(): Promise<ZoneRow[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  const rows = await prisma.zone.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
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
      name: r.name,
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
 * Build the admin-assignment "search horizon" around a point:
 *   - every zone that contains the point (rank 0 — the order's own zones)
 *   - plus the `fallbackCount` nearest zones whose center is closest to the
 *     point but which DO NOT contain it (rank 1..N — fallbacks shown only
 *     when the primary zones turn up no candidates)
 *
 * Sorted by rank ascending, then distance ascending. Returns at most
 * `primary.length + fallbackCount` rows. Used by GET /admin/orders/:id/
 * eligible-{stores,drivers} so the admin UI can group candidates by
 * "in zone" vs "nearest 3 fallback zones" — matching how the product is
 * supposed to behave per the 2026-06 zone-engine spec.
 */
export async function nearestZonesForPoint(
  lat: number,
  lng: number,
  fallbackCount = 3,
): Promise<RankedZone[]> {
  const zones = await loadZones();
  if (zones.length === 0) return [];
  const annotated = zones.map((z) => {
    const distanceKm = haversineDistance(lat, lng, z.centerLat, z.centerLng);
    return { ...z, distanceKm, containsPoint: distanceKm <= z.radiusKm };
  });
  const primary = annotated
    .filter((z) => z.containsPoint)
    .sort((a, b) => a.radiusKm - b.radiusKm) // tightest first
    .map((z) => ({ ...z, rank: 0 }));
  const fallback = annotated
    .filter((z) => !z.containsPoint)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, fallbackCount)
    .map((z, i) => ({ ...z, rank: i + 1 }));
  return [...primary, ...fallback];
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
