# Ranking algorithm

Where: `backend/src/services/ranking.service.ts`
Consumers:
- `GET /api/v1/items/search` (customer-web storefront ranking)
- `backend/src/services/matching.service.ts` (store-broadcast ordering — see [caveat](#why-matching-doesnt-yet-share-the-formula))

This doc explains the composite score that determines *which item from which store* a customer sees first when they search. The numbers are tunable; the structure is not — it mirrors the public playbooks of Zepto, Blinkit and Swiggy Instamart and the standard learning-to-rank features used in e-commerce search.

## The formula

For each candidate store-item (one StoreItem row at an ACTIVE, OPEN, non-wholesaler store within the radius):

```
norm_price  = (price - minP) / max(maxP - minP, ε)        ∈ [0, 1]   (cheapest = 0)
norm_dist   = min(distance / radius, 1)                   ∈ [0, 1]   (closest  = 0)
norm_rating = clamp(rating, 0, 5) / 5                     ∈ [0, 1]

score = 0.40 · (1 - norm_price)        // price weight
      + 0.30 · (1 - norm_dist)         // proximity weight
      + 0.20 · norm_rating             // quality signal
      + (isPreferred ? 0.10 : 0)       // admin-flagged store boost
```

All four knobs live in `DEFAULT_WEIGHTS` (`ranking.service.ts`). The non-preferred weights sum to 1.0; the preferred-store boost is additive so a "preferred" store outranks an equivalent non-preferred one without dominating wildly mismatched stores.

### Why these weights?

| Weight | Term | Rationale |
|---|---|---|
| 0.40 | price | Quick-commerce surveys (Bain/IFA 2024) consistently show price as the #1 driver of switch behaviour for daily essentials. |
| 0.30 | distance | Closer = faster delivery, lower delivery cost, fresher produce. Capped at the radius so users don't see "12 km" rows when 5 km options exist. |
| 0.20 | rating | Important but slow-moving. Most stores cluster at 4.0-4.6 — too dominant a weight makes the leaderboard look frozen. |
| 0.10 | preferred boost | Admin override for stores with strong fill-rate / SLA. Implementing-team's escape hatch, not a customer-facing feature. |

### Normalisation choices

- **Price**: per-query normalisation (using the cheapest and most expensive matching candidates) — so a 50 % price gap looks the same in cheap categories and expensive ones. The ε guard prevents divide-by-zero when all candidates are the same price.
- **Distance**: per-query radius — keeps the score scale consistent regardless of whether the customer asked for a 2 km or 10 km radius.
- **Rating**: a fixed 5-point scale — comparable across queries.

## Sort modes

`/api/v1/items/search?sort=` accepts:

| `sort` | Behaviour |
|---|---|
| `recommended` *(default)* | The composite score above. |
| `cheapest` | Ascending `price`. Ties broken arbitrarily. |
| `nearest` | Ascending `distanceKm`. |

`cheapest` and `nearest` are pure single-feature sorts on purpose — they're the "show me your work" sanity check users hit when they feel the recommended list missed the mark.

## Tunable knobs

Edit `DEFAULT_WEIGHTS` in `ranking.service.ts`:

```ts
export const DEFAULT_WEIGHTS: RankingWeights = {
  price: 0.4,
  distance: 0.3,
  rating: 0.2,
  preferredBoost: 0.1,
};
```

If you want per-environment tuning (A/B testing, regional overrides) the right hook is `scoreCandidate(candidate, norms, weights)` — pass a different `weights` object per request.

Future work in slices to come:

- Personalisation features (last-ordered store, reorder frequency, viewed-but-skipped) — would slot in as an extra term, sum-of-weights staying at 1.0.
- Learned weights via offline regression on conversion data — same shape, different numbers.
- A category-specific override (medicine should weight rating higher; staples should weight price higher).

## Why matching doesn't yet share the formula

The matching engine (`matching.service.ts`) scores stores against a *specific order* (a customer cart), not against individual items. Its formula has a different shape:

```
score = 0.60 · match_ratio       (how many of the cart's catalog items the store stocks)
      + 0.30 · proximity         (1 - dist/radius)
      + 0.10 · rating / 5
      + 0.15 · preferredBoost
```

`match_ratio` is the dominant feature — there's no point ranking a store with the best price/distance if it doesn't have most of what the customer asked for. Replacing it with the price-first formula above would degrade matching, so the two are *deliberately* separate for now.

Both services import `RankingWeights` / `scoreCandidate` from `ranking.service.ts`; the matching engine just doesn't call them today. A future slice may unify them around `match_ratio × ranking.score`. Keeping the maths in one module makes that refactor a one-day job rather than a week of risk.

## References

- Bain & Co., *India Quick Commerce Outlook 2024* (price + speed as top switching drivers)
- Zepto / Blinkit engineering blogs on store-radius decay and rating clamping
- Microsoft LETOR / Amazon "Learning to Rank for Recommender Systems" (composite-feature blending baseline)
