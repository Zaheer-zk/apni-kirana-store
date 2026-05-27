// Real-time fan-out to the admin live-ops dashboard. Computes which zone
// rooms care about a given coordinate (point-in-circle vs every active
// zone) and pings the matching `liveops:<zoneId>` rooms PLUS the global
// `liveops:all` room. Admin's live-ops page subscribes to its currently-
// selected room and invalidates its React Query cache on ping → instant
// refresh, no per-event payload to serialise.
//
// Zones are cached in-process for 60s. Zone CRUD is rare (admin-only,
// maybe a few times per week), so a short TTL is plenty without wiring
// invalidation hooks into every zone mutation route.

import { io } from '../socket';
import { prisma } from '../config/prisma';
import { haversineDistance } from '../utils/geo';

interface ZoneCircle {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

let zoneCache: { value: ZoneCircle[]; fetchedAt: number } | null = null;
const ZONE_CACHE_TTL_MS = 60_000;

async function getZones(): Promise<ZoneCircle[]> {
  if (zoneCache && Date.now() - zoneCache.fetchedAt < ZONE_CACHE_TTL_MS) {
    return zoneCache.value;
  }
  const rows = await prisma.zone.findMany({
    where: { isActive: true },
    select: { id: true, centerLat: true, centerLng: true, radiusKm: true },
  });
  zoneCache = { value: rows, fetchedAt: Date.now() };
  return rows;
}

/** Reset cache — call after admin creates/edits/deletes a zone. */
export function invalidateZoneCache(): void {
  zoneCache = null;
}

/**
 * Notify admin live-ops dashboards that something changed at (lat, lng).
 * The frontend only needs to know "your snapshot is stale, refetch" — we
 * don't ship the new data over the socket, that's the next-poll's job.
 *
 * `points` is a list of coords associated with the change (e.g. for an
 * order: [store, dropoff, driver-current-position]). The signal goes to
 * every zone that contains ANY of the points + `liveops:all`.
 */
export async function pingLiveOps(
  reason: 'order:update' | 'driver:location' | 'driver:status',
  points: Array<{ lat: number; lng: number } | null>,
): Promise<void> {
  if (!io) return;

  // Always notify the "all zones" room — admins viewing the unfiltered map.
  io.to('liveops:all').emit('liveops:invalidate', { reason, at: Date.now() });

  const valid = points.filter(
    (p): p is { lat: number; lng: number } =>
      !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (valid.length === 0) return;

  try {
    const zones = await getZones();
    const matched = new Set<string>();
    for (const z of zones) {
      for (const p of valid) {
        if (haversineDistance(z.centerLat, z.centerLng, p.lat, p.lng) <= z.radiusKm) {
          matched.add(z.id);
          break;
        }
      }
    }
    for (const zoneId of matched) {
      io.to(`liveops:${zoneId}`).emit('liveops:invalidate', { reason, at: Date.now() });
    }
  } catch (err) {
    // Non-fatal — admin will still get the all-zones ping + fall back to poll.
    console.warn('[liveops] zone lookup failed:', err);
  }
}
