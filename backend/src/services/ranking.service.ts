// =====================================================================================
// Ranking service — shared scoring formula for store / item recommendations.
//
// WHY ITS OWN MODULE
// ──────────────────
// Two places need the SAME composite score:
//   1. The matching engine (`matching.service.ts`) when broadcasting an order
//      to the top-N stores carrying the customer's items.
//   2. The public item-search endpoint (`GET /api/v1/items/search`) which
//      ranks every store-item near the customer when they're browsing.
//
// We used to inline the math in both places and they drifted. Extracting
// keeps the formula honest and the docs/ranking-algorithm.md doc points
// here as the source of truth.
//
// THE FORMULA  (see docs/ranking-algorithm.md for derivation + references)
// ──────────────────────────────────────────────────────────────────────
//   norm_price = (price - minP) / max(maxP - minP, ε)            // 0..1, cheapest = 0
//   norm_dist  = min(distance / radius, 1)                       // 0..1, closest  = 0
//   norm_rating = clamp(rating, 0, 5) / 5                        // 0..1
//   score = 0.40 * (1 - norm_price)        // price weight
//         + 0.30 * (1 - norm_dist)         // proximity weight
//         + 0.20 * norm_rating             // quality signal
//         + (preferred ? 0.10 : 0)         // admin-flagged store boost
//
// All weights live in WEIGHTS so a single edit retunes the system. Keep the
// non-preferred weights summing to 1.0 — the preferred boost is additive on
// top.
// =====================================================================================

export interface RankingWeights {
  price: number;
  distance: number;
  rating: number;
  preferredBoost: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  price: 0.4,
  distance: 0.3,
  rating: 0.2,
  preferredBoost: 0.1,
};

export interface RankableCandidate {
  /** Unit price the customer would pay. */
  price: number;
  /** Distance from the customer in kilometres. */
  distanceKm: number;
  /** Store rating on a 0-5 scale. */
  rating: number;
  /** Admin-marked "preferred" store. */
  isPreferred?: boolean;
}

export interface RankingNormalizers {
  /** Cheapest price in the candidate set — used to normalise the price term. */
  minPrice: number;
  /** Most expensive price in the candidate set. */
  maxPrice: number;
  /** Search radius (km) used to normalise distances. Distances beyond this
   *  are clamped to 1.0. */
  radiusKm: number;
}

/**
 * Compute the score for a single candidate given the population-level
 * normalisers. Returns a number in [0, 1.1] (the extra 0.1 is the optional
 * preferred-store boost).
 */
export function scoreCandidate(
  candidate: RankableCandidate,
  norms: RankingNormalizers,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): number {
  const EPS = 1e-6;
  const priceSpread = Math.max(norms.maxPrice - norms.minPrice, EPS);
  const normPrice = clamp((candidate.price - norms.minPrice) / priceSpread, 0, 1);
  const normDist = clamp(candidate.distanceKm / Math.max(norms.radiusKm, EPS), 0, 1);
  const normRating = clamp(candidate.rating, 0, 5) / 5;

  return (
    weights.price * (1 - normPrice) +
    weights.distance * (1 - normDist) +
    weights.rating * normRating +
    (candidate.isPreferred ? weights.preferredBoost : 0)
  );
}

/**
 * Derive normalisers from a pool of candidates. Centralised so consumers
 * can't accidentally pass a `maxPrice < minPrice`.
 */
export function deriveNormalizers(
  candidates: Pick<RankableCandidate, 'price'>[],
  radiusKm: number,
): RankingNormalizers {
  if (candidates.length === 0) {
    return { minPrice: 0, maxPrice: 1, radiusKm: Math.max(radiusKm, 1) };
  }
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candidates) {
    if (c.price < minPrice) minPrice = c.price;
    if (c.price > maxPrice) maxPrice = c.price;
  }
  if (!isFinite(minPrice) || !isFinite(maxPrice)) {
    return { minPrice: 0, maxPrice: 1, radiusKm: Math.max(radiusKm, 1) };
  }
  return { minPrice, maxPrice, radiusKm: Math.max(radiusKm, 1) };
}

/**
 * Sort a list of candidates in place by composite score (descending).
 * Returns the same array so it can be chained.
 */
export function rankCandidates<T extends RankableCandidate>(
  candidates: T[],
  radiusKm: number,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): Array<T & { score: number }> {
  const norms = deriveNormalizers(candidates, radiusKm);
  const withScores = candidates.map((c) => ({
    ...c,
    score: scoreCandidate(c, norms, weights),
  }));
  withScores.sort((a, b) => b.score - a.score);
  return withScores;
}

function clamp(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
