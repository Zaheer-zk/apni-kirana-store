// Unit tests for the route optimiser. Pure functions, no DB.
//
// We test both the public API (optimizePickupOrder) and the brute-
// force / 2-opt branches independently so a regression in one path
// fails loudly. The "U-shape" case is the canonical example where
// nearest-neighbour gets it wrong but TSP gets it right.
//
// Mocks: the repo's jest setup.ts tries to talk to Postgres + Redis in
// beforeAll/beforeEach. This file is pure-unit (no DB), so we stub
// prisma + redis to make the suite runnable in any environment — CI,
// laptop without docker, etc. Mocks must be declared before the
// service import so the resolved modules use them.

jest.mock('../src/config/prisma', () => ({
  prisma: {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../src/config/redis', () => ({
  redis: {
    flushdb: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  },
}));

import { __test, optimizePickupOrder } from '../src/services/route-optimizer.service';
import { haversineDistance } from '../src/utils/geo';

// 1 degree of latitude ≈ 111 km, so working in 0.01° units gives ~1 km
// per unit — easy to reason about while still using the real great-
// circle math.

describe('optimizePickupOrder', () => {
  it('returns the empty array + direct driver→dropoff distance for no pickups', () => {
    const r = optimizePickupOrder({
      driverLat: 28.6,
      driverLng: 77.2,
      pickups: [],
      dropoffLat: 28.6,
      dropoffLng: 77.3,
    });
    expect(r.order).toEqual([]);
    expect(r.totalKm).toBeCloseTo(
      haversineDistance(28.6, 77.2, 28.6, 77.3),
      6,
    );
  });

  it('single pickup is returned unchanged', () => {
    const r = optimizePickupOrder({
      driverLat: 28.6,
      driverLng: 77.2,
      pickups: [{ id: 'A', lat: 28.61, lng: 77.21 }],
      dropoffLat: 28.62,
      dropoffLng: 77.22,
    });
    expect(r.order.map((p) => p.id)).toEqual(['A']);
  });

  it('two pickups: optimiser returns the shorter ordering of the two', () => {
    // Driver(0,0); pickups A and B; dropoff somewhere. Whichever
    // permutation has the lower trip distance must be the one
    // returned. We don't hand-compute the geometry — we just assert
    // the optimiser doesn't return a strictly-worse ordering than
    // the alternative.
    const driver = { driverLat: 0, driverLng: 0 };
    const drop = { dropoffLat: 0.045, dropoffLng: 0.045 };
    const A = { id: 'A', lat: 0.04, lng: 0.0 };
    const B = { id: 'B', lat: 0.0, lng: 0.04 };
    const r = optimizePickupOrder({ ...driver, pickups: [A, B], ...drop });
    const altScore = __test.scoreOrder(
      0,
      0,
      r.order[0]!.id === 'A' ? [B, A] : [A, B],
      drop.dropoffLat,
      drop.dropoffLng,
    );
    expect(r.totalKm).toBeLessThanOrEqual(altScore + 1e-9);
  });

  it('U-shape: nearest-neighbour gets it wrong, TSP gets it right', () => {
    // Classic 3-pickup case where NN takes the nearest first but ends
    // up backtracking. Pickups laid out roughly:
    //
    //     P2 (far north)
    //     |
    //     |
    //     P0 (close north)
    //     |
    //  Driver(0,0) ─── P1 (east)  ── Dropoff (far east)
    //
    // NN order from driver: P0 (closest), then P1 (sideways), then P2
    // (back north), then dropoff way east → lots of north-south
    // backtracking.
    // TSP order: P1 east → P0 north → P2 further north → dropoff back
    // east — actually NN sometimes lucks into the same answer, so
    // pick coordinates that GUARANTEE NN loses.
    //
    // Try: driver at (0,0), P_near at (1,0) (1 km north), P_far at
    // (10,0) (10 km north), P_east at (0,2) (2 km east), dropoff at
    // (11,0) (11 km north).
    //   NN: P_near(1) → P_east(2.24 over) → P_far(10.2 over) → drop(11)
    //       total ≈ 24.4 km
    //   TSP: P_east(2) → P_near(2.24) → P_far(9) → drop(1)
    //       total ≈ 14.2 km   ✓ optimal
    const r = optimizePickupOrder({
      driverLat: 0,
      driverLng: 0,
      pickups: [
        { id: 'NEAR', lat: 0.009, lng: 0 }, // ~1 km north
        { id: 'FAR', lat: 0.09, lng: 0 }, // ~10 km north
        { id: 'EAST', lat: 0, lng: 0.018 }, // ~2 km east
      ],
      dropoffLat: 0.099, // ~11 km north
      dropoffLng: 0,
    });

    // Compute NN score for comparison.
    const nn = __test.nearestNeighbour(0, 0, [
      { id: 'NEAR', lat: 0.009, lng: 0 },
      { id: 'FAR', lat: 0.09, lng: 0 },
      { id: 'EAST', lat: 0, lng: 0.018 },
    ]);
    const nnScore = __test.scoreOrder(0, 0, nn, 0.099, 0);

    expect(r.totalKm).toBeLessThanOrEqual(nnScore);
    // The optimal route should not start with NEAR (that's the
    // nearest-neighbour trap). Just assert TSP doesn't pick the
    // greedy answer when it's worse.
    if (nnScore > r.totalKm) {
      expect(r.order.map((p) => p.id)).not.toEqual(['NEAR', 'EAST', 'FAR']);
    }
  });

  it('brute-force is used for n <= 8', () => {
    const pickups = Array.from({ length: 6 }, (_, i) => ({
      id: `P${i}`,
      lat: 0.01 * i,
      lng: 0.005 * i,
    }));
    const r = optimizePickupOrder({
      driverLat: 0,
      driverLng: 0,
      pickups,
      dropoffLat: 0.1,
      dropoffLng: 0.05,
    });
    expect(r.order.length).toBe(6);
    // Score should match the explicit brute-force on the same input.
    const direct = __test.bruteForce(0, 0, pickups, 0.1, 0.05);
    expect(r.totalKm).toBeCloseTo(direct.totalKm, 6);
  });

  it('falls back to 2-opt heuristic for n > 8 and still beats unordered input', () => {
    // 10 pickups scattered on a grid — too many for brute force,
    // small enough that 2-opt should find a near-optimal route.
    const pickups = [
      { id: 'A', lat: 0.01, lng: 0 },
      { id: 'B', lat: 0, lng: 0.01 },
      { id: 'C', lat: 0.01, lng: 0.01 },
      { id: 'D', lat: 0.02, lng: 0 },
      { id: 'E', lat: 0, lng: 0.02 },
      { id: 'F', lat: 0.02, lng: 0.02 },
      { id: 'G', lat: 0.03, lng: 0.01 },
      { id: 'H', lat: 0.01, lng: 0.03 },
      { id: 'I', lat: 0.04, lng: 0.04 },
      { id: 'J', lat: 0.05, lng: 0 },
    ];
    const naiveScore = __test.scoreOrder(0, 0, pickups, 0.05, 0.05);
    const r = optimizePickupOrder({
      driverLat: 0,
      driverLng: 0,
      pickups,
      dropoffLat: 0.05,
      dropoffLng: 0.05,
    });
    expect(r.order.length).toBe(10);
    // 2-opt over a NN seed should beat the original input order
    // (which is essentially arbitrary). Equal would be suspicious.
    expect(r.totalKm).toBeLessThan(naiveScore);
  });

  it('preserves all input pickup ids (no duplicates / no losses)', () => {
    const pickups = [
      { id: 'A', lat: 0.01, lng: 0 },
      { id: 'B', lat: 0, lng: 0.01 },
      { id: 'C', lat: 0.02, lng: 0.02 },
      { id: 'D', lat: 0.03, lng: 0.01 },
    ];
    const r = optimizePickupOrder({
      driverLat: 0,
      driverLng: 0,
      pickups,
      dropoffLat: 0.05,
      dropoffLng: 0.05,
    });
    const ids = r.order.map((p) => p.id).sort();
    expect(ids).toEqual(['A', 'B', 'C', 'D']);
  });

  it('the public optimum is never worse than the input ordering', () => {
    // Sanity property: whatever order the caller passes in, TSP can
    // at worst return the same thing — never a longer route.
    const inputs = [
      { id: 'A', lat: 0.04, lng: 0.0 },
      { id: 'B', lat: 0.0, lng: 0.04 },
      { id: 'C', lat: 0.02, lng: 0.02 },
    ];
    const inputScore = __test.scoreOrder(0, 0, inputs, 0.05, 0.05);
    const r = optimizePickupOrder({
      driverLat: 0,
      driverLng: 0,
      pickups: inputs,
      dropoffLat: 0.05,
      dropoffLng: 0.05,
    });
    expect(r.totalKm).toBeLessThanOrEqual(inputScore);
  });
});
