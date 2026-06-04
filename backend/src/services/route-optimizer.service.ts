// Pickup-order optimisation for multi-store driver legs.
//
// Problem statement
// -----------------
// Given the driver's current location, N pickup points (one per store
// in the order group), and the customer's dropoff, return the pickup
// ordering that minimises the total trip distance
//   driver → p[0] → p[1] → ... → p[N-1] → dropoff.
// This is the open Traveling-Salesman Problem with fixed start (driver)
// and fixed end (dropoff).
//
// Sizing
// ------
// Real multi-store baskets sit at 2-4 stores; we don't expect more than
// 6-8 in practice. At 8! = 40,320 permutations and a few floating-point
// ops per scoring, brute-force enumeration runs in ~1 ms — exact and
// genuinely free.
//
// Above 8 we'd be spending >300,000 evaluations, which still works but
// starts to feel weird; fall back to a nearest-neighbour seed + 2-opt
// swaps. This branch is defensive — production never hits it today.
//
// Picked-up legs
// --------------
// Legs the driver has already collected don't need re-ordering — they're
// in the bag. The caller is expected to pass only NOT-yet-picked-up
// pickups; we keep the API tight rather than splitting the array
// inside this module.
//
// Distance metric
// ---------------
// We use haversine straight-line distance. Real road routes can differ,
// but: (1) the existing matching engine + UI everywhere else uses
// haversine, so the optimiser stays consistent with the numbers a
// driver sees on the map, and (2) we have no routing API yet. Future
// work: swap in OSRM / Mapbox / Google Distance Matrix if we add a
// dependency budget for it.

import { haversineDistance } from '../utils/geo';

export interface PickupPoint {
  /** Stable id — usually the child Order id; used purely as a key. */
  id: string;
  lat: number;
  lng: number;
}

interface OptimizeOpts {
  driverLat: number;
  driverLng: number;
  pickups: PickupPoint[];
  dropoffLat: number;
  dropoffLng: number;
}

interface OptimizeResult<T extends PickupPoint> {
  order: T[];
  /** Total trip distance in km (driver → ...pickups → dropoff). */
  totalKm: number;
}

const BRUTE_FORCE_LIMIT = 8;

/**
 * Score a candidate ordering: total km from driver through every
 * pickup in order, ending at the dropoff.
 */
function scoreOrder(
  driverLat: number,
  driverLng: number,
  order: PickupPoint[],
  dropoffLat: number,
  dropoffLng: number,
): number {
  if (order.length === 0) {
    return haversineDistance(driverLat, driverLng, dropoffLat, dropoffLng);
  }
  let prevLat = driverLat;
  let prevLng = driverLng;
  let total = 0;
  for (const p of order) {
    total += haversineDistance(prevLat, prevLng, p.lat, p.lng);
    prevLat = p.lat;
    prevLng = p.lng;
  }
  total += haversineDistance(prevLat, prevLng, dropoffLat, dropoffLng);
  return total;
}

/**
 * Enumerate every permutation of `items` and yield them. Iterative
 * Heap's-algorithm-style generator so we don't pay recursion stack.
 *
 * Yields the SAME array reference each time with a different
 * arrangement; callers must read what they need before continuing.
 */
function* permutations<T>(items: T[]): Generator<T[]> {
  const n = items.length;
  if (n <= 1) {
    yield items.slice();
    return;
  }
  const a = items.slice();
  const c = new Array(n).fill(0);
  yield a.slice();
  let i = 1;
  while (i < n) {
    if (c[i]! < i) {
      const k = i % 2 === 0 ? 0 : c[i]!;
      [a[k], a[i]] = [a[i]!, a[k]!];
      yield a.slice();
      c[i]++;
      i = 1;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

/**
 * Exact TSP via brute-force. Caps at BRUTE_FORCE_LIMIT pickups.
 */
function bruteForce<T extends PickupPoint>(
  driverLat: number,
  driverLng: number,
  pickups: T[],
  dropoffLat: number,
  dropoffLng: number,
): OptimizeResult<T> {
  let best: T[] = pickups.slice();
  let bestScore = scoreOrder(driverLat, driverLng, best, dropoffLat, dropoffLng);
  for (const perm of permutations(pickups)) {
    const s = scoreOrder(driverLat, driverLng, perm, dropoffLat, dropoffLng);
    if (s < bestScore) {
      bestScore = s;
      best = perm.slice() as T[];
    }
  }
  return { order: best, totalKm: bestScore };
}

/**
 * Nearest-neighbour seed: at each step pick the closest unvisited
 * pickup. Cheap and not optimal but produces a sensible starting
 * point for the 2-opt pass below.
 */
function nearestNeighbour<T extends PickupPoint>(
  driverLat: number,
  driverLng: number,
  pickups: T[],
): T[] {
  const remaining = pickups.slice();
  const order: T[] = [];
  let prevLat = driverLat;
  let prevLng = driverLng;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(prevLat, prevLng, remaining[i]!.lat, remaining[i]!.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    order.push(next);
    prevLat = next.lat;
    prevLng = next.lng;
  }
  return order;
}

/**
 * 2-opt improvement: try every pair of edges (i, j) and reverse the
 * segment between them if doing so shortens the total trip. Repeat
 * until no improving swap exists. Quadratic per pass, O(n^3) total in
 * the worst case — fine for the >8-pickup fallback.
 */
function twoOpt<T extends PickupPoint>(
  driverLat: number,
  driverLng: number,
  pickups: T[],
  dropoffLat: number,
  dropoffLng: number,
): OptimizeResult<T> {
  let order = pickups.slice();
  let bestScore = scoreOrder(driverLat, driverLng, order, dropoffLat, dropoffLng);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = order.slice();
        // Reverse the [i, j] segment in place.
        const seg = candidate.slice(i, j + 1).reverse();
        for (let k = 0; k < seg.length; k++) candidate[i + k] = seg[k]!;
        const s = scoreOrder(driverLat, driverLng, candidate, dropoffLat, dropoffLng);
        if (s < bestScore - 1e-9) {
          // 1e-9 epsilon guards against floating-point noise reporting
          // an "improvement" that's really equality.
          bestScore = s;
          order = candidate;
          improved = true;
        }
      }
    }
  }
  return { order, totalKm: bestScore };
}

/**
 * Pickup-order optimiser. See file header for the why.
 *
 * Generic over the pickup row so callers can pass extra fields (status,
 * store name, etc.) and get the same shape back — we only read lat/lng.
 *
 * Stable for empty input: returns the array as-is + driver→dropoff
 * distance.
 */
export function optimizePickupOrder<T extends PickupPoint>(opts: {
  driverLat: number;
  driverLng: number;
  pickups: T[];
  dropoffLat: number;
  dropoffLng: number;
}): OptimizeResult<T> {
  const { driverLat, driverLng, pickups, dropoffLat, dropoffLng } = opts;
  if (pickups.length === 0) {
    return {
      order: [],
      totalKm: haversineDistance(driverLat, driverLng, dropoffLat, dropoffLng),
    };
  }
  if (pickups.length === 1) {
    return {
      order: pickups.slice(),
      totalKm: scoreOrder(driverLat, driverLng, pickups, dropoffLat, dropoffLng),
    };
  }
  if (pickups.length <= BRUTE_FORCE_LIMIT) {
    return bruteForce(driverLat, driverLng, pickups, dropoffLat, dropoffLng);
  }
  // > BRUTE_FORCE_LIMIT — heuristic path.
  const seed = nearestNeighbour(driverLat, driverLng, pickups);
  return twoOpt(driverLat, driverLng, seed, dropoffLat, dropoffLng);
}

// Internal helpers exported solely for unit testing — the public API is
// `optimizePickupOrder`. Keeping these accessible lets us assert that
// the brute-force and heuristic paths individually behave as expected.
export const __test = { scoreOrder, bruteForce, nearestNeighbour, twoOpt };
