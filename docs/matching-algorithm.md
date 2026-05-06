# Matching Algorithm

Two engines govern the lifecycle of every order:

1. **Store matching** — `backend/src/services/matching.service.ts` — picks who fulfills the order.
2. **Driver assignment** — `backend/src/services/driver.service.ts` — picks who delivers it.

After the marketplace pivot, both engines support **two modes**: `BROADCAST`
(parallel, first-accept-wins; the new default) and `CASCADE` (serial,
one-at-a-time; the legacy behaviour). The mode is chosen per engine via env
vars and can be flipped per environment without code changes.

| Env var | Default | Values |
| --- | --- | --- |
| `STORE_MATCHING_MODE` | `BROADCAST` | `BROADCAST` / `CASCADE` |
| `DRIVER_MATCHING_MODE` | `BROADCAST` | `BROADCAST` / `CASCADE` |

## Constants

Hard-coded in `backend/src/services/matching.service.ts` and
`backend/src/services/driver.service.ts`. Promoting these to env / DB-backed
settings is on the roadmap.

| Constant | Value | Purpose |
| --- | --- | --- |
| `MIN_ITEM_MATCH_PERCENT` | `0.6` | Drop stores carrying < 60% of the order's catalog items |
| `TOP_N_BROADCAST` (stores) | `5` | Max stores notified per broadcast round |
| `TOP_N_BROADCAST` (drivers) | `3` | Max drivers notified per broadcast round |
| `SEARCH_RADIUS_KM` | `5` | Max distance store/driver can be from customer/store |
| `STORE_RETRY_DELAY_MS` | `3 × 60_000` | If no store accepts, retry next round after 3 min |
| `DRIVER_ACCEPT_TIMEOUT_MS` | `60_000` | Per-broadcast accept window for drivers |
| `DRIVER_RETRY_DELAY_MS` | `2 × 60_000` | Driver retry interval if pool is empty |

## Store matching

### Inputs

- The pending `Order` and its `OrderItem` rows (each pointing at a `StoreItem.id`).
- The customer's `deliveryAddress.lat` / `lng`.
- An optional `excludeStoreIds[]` so retries skip stores already tried.

### Step 1 — Resolve catalog ids

`OrderItem.itemId` references a `StoreItem`. We need the **catalog ids** so we
can compare across stores:

```ts
const orderStoreItems = await prisma.storeItem.findMany({
  where: { id: { in: order.items.map((i) => i.itemId).filter(Boolean) } },
  select: { catalogItemId: true },
});
const orderCatalogItemIds = orderStoreItems.map((si) => si.catalogItemId);
const totalCatalogItems = new Set(orderCatalogItemIds).size;
```

### Step 2 — Bounding box prefilter

Cheap geo prefilter on the indexed `(lat, lng)` columns, then a `some` filter
that keeps only stores carrying at least one of the requested catalog items
with stock > 0:

```ts
const candidateStores = await prisma.store.findMany({
  where: {
    status: 'ACTIVE',
    isOpen: true,
    id: { notIn: excludeStoreIds },
    lat: { gte: box.minLat, lte: box.maxLat },
    lng: { gte: box.minLng, lte: box.maxLng },
    items: {
      some: {
        catalogItemId: { in: orderCatalogItemIds },
        isAvailable: true,
        stockQty: { gt: 0 },
      },
    },
  },
  include: {
    items: {
      where: { catalogItemId: { in: orderCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } },
    },
  },
});
```

### Step 3 — Score each candidate

For every store inside the radius:

```ts
const distanceKm     = haversineDistance(lat, lng, store.lat, store.lng);
const matchedItemCount = new Set(store.items.map(si => si.catalogItemId)).size;
const matchRatio     = matchedItemCount / totalCatalogItems;
if (matchRatio < MIN_ITEM_MATCH_PERCENT) continue;          // skip < 60% match

const proximityScore = Math.max(0, 1 - distanceKm / SEARCH_RADIUS_KM);
const ratingScore    = (store.rating ?? 0) / 5;

const score = matchRatio * 0.6 + proximityScore * 0.3 + ratingScore * 0.1;
```

| Component | Weight | Meaning |
| --- | --- | --- |
| `matchRatio` | 0.6 | "How much of this cart can the store actually fulfill?" — dominant factor (majority-first). |
| `proximityScore` | 0.3 | Closer = better, normalized to 0..1 over `SEARCH_RADIUS_KM`. |
| `ratingScore` | 0.1 | Light boost for popular stores; tiebreaker. |

Stores below `MIN_ITEM_MATCH_PERCENT` (60%) are dropped — the system would
rather wait/retry than ship a half-empty order.

### Step 4 (BROADCAST) — Notify the top N in parallel

Default mode. Take the top `TOP_N_BROADCAST = 5` scored stores and notify
**all of them in parallel**. The first store to call `PUT /orders/:id/accept`
wins; everyone else gets `order:rescinded`.

```ts
await Promise.all(top.map(async (s) => {
  await sendNotification(s.ownerId, 'New order available', `Order ${id} — ${s.matchedItemCount} items match • ${s.distanceKm.toFixed(1)} km away`);
  io?.to(`user:${s.ownerId}`).emit('order:offered', {
    orderId, score: s.score, distanceKm: s.distanceKm, matchedItemCount: s.matchedItemCount,
  });
}));

// Safety net
await matchingQueue.add('broadcast-timeout',
  { orderId, excludeStoreIds: top.map(s => s.storeId) },
  { delay: STORE_RETRY_DELAY_MS },           // 3 minutes
);
```

If no one accepts within `STORE_RETRY_DELAY_MS = 3 min`, the safety-net job
runs and broadcasts to the **next** `TOP_N_BROADCAST` candidates (with the
already-tried set passed in `excludeStoreIds` via the BullMQ payload).

### Step 4 (CASCADE) — Pick best, wait, retry

Legacy mode for low-volume areas. Notify only the single best store, set
`Order.storeId`, wait `STORE_RETRY_DELAY_MS`. On reject/timeout, retry with the
next best store.

```ts
await prisma.order.update({ where: { id: orderId }, data: { storeId: best.storeId } });
io?.to(`user:${best.ownerId}`).emit('order:offered', { orderId });
await matchingQueue.add('retry-store-match',
  { orderId, excludeStoreIds: [...excludeStoreIds, best.storeId] },
  { delay: STORE_RETRY_DELAY_MS });
```

### Edge cases

| Case | Handling |
| --- | --- |
| No store within radius matches ≥ 60% of items | Order auto-cancelled with reason "No nearby store can fulfill your order at this time"; customer notified. |
| Customer cancels mid-cascade | `rankStores` early-returns when `order.status !== 'PENDING'`. |
| Store toggles closed during the broadcast window | Counts as no-response; safety-net job kicks in after 3 min. |
| Two stores accept "simultaneously" | DB-level row update on `Order.storeId` + status `STORE_ACCEPTED` is the serialization point; the second `accept` call sees the status has changed and returns `400`. |
| Tie on score | Stable sort — earlier insertion wins. |

### Why BROADCAST vs CASCADE?

- **BROADCAST** is faster for high-demand items where multiple stores compete; you eat extra notifications but get acceptance in seconds.
- **CASCADE** is gentler for low-volume areas where store owners would feel spammed by parallel offers.

Flip per env: `STORE_MATCHING_MODE=CASCADE` to revert.

## Driver assignment

Triggered when a store accepts (`PUT /orders/:id/accept` calls
`assignDriverForOrder`).

### Step 1 — Find ONLINE drivers

```ts
const candidates = await prisma.driver.findMany({
  where: {
    status: 'ONLINE',
    id: { notIn: excludeDriverIds },
    currentLat: { gte: box.minLat, lte: box.maxLat },
    currentLng: { gte: box.minLng, lte: box.maxLng },
  },
});
```

### Step 2 — Score each driver

```ts
const proximityScore = Math.max(0, 1 - distanceKm / DRIVER_SEARCH_RADIUS_KM);
const ratingScore    = (d.rating ?? 0) / 5;
const freshnessScore = 1;        // placeholder; will use last-delivered timestamp
const score = proximityScore * 0.6 + ratingScore * 0.3 + freshnessScore * 0.1;
```

| Component | Weight | Meaning |
| --- | --- | --- |
| `proximityScore` | 0.6 | Closer to the **store** (pickup point) = better. |
| `ratingScore` | 0.3 | Reward better-rated drivers. |
| `freshnessScore` | 0.1 | Idle-but-online check; currently always 1 — placeholder. |

### Step 3 (BROADCAST) — Top 3 in parallel

```ts
const top = scored.slice(0, TOP_N_BROADCAST); // 3
await Promise.all(top.map(async (d) => {
  await sendNotification(d.userId, 'New delivery offer', `Pickup ${d.distanceKm.toFixed(1)} km away. Tap to view & accept.`);
  io?.to(`user:${d.userId}`).emit('order:assigned', { orderId, distanceKm: d.distanceKm, score: d.score });
}));

await driverQueue.add('broadcast-driver-timeout',
  { orderId, excludeDriverIds: top.map(d => d.driverId) },
  { delay: DRIVER_ACCEPT_TIMEOUT_MS * 2 },     // 2 min safety retry
);
```

First driver to call `PUT /drivers/orders/:id/accept` wins; the others get
`order:rescinded`.

### Step 3 (CASCADE) — Nearest first, 60s

```ts
await prisma.order.update({
  where: { id: orderId },
  data: { driverId: best.driverId, status: 'DRIVER_ASSIGNED', driverAssignedAt: new Date() },
});
await driverQueue.add('driver-accept-timeout',
  { orderId, excludeDriverIds: [...excludeDriverIds, best.driverId] },
  { delay: DRIVER_ACCEPT_TIMEOUT_MS });        // 60 s
```

### Edge cases

| Case | Handling |
| --- | --- |
| No driver in radius | Customer notified ("Finding a driver…"); job retries after `DRIVER_RETRY_DELAY_MS = 2 min`. |
| All top-N drivers ignore the offer | Safety-net `broadcast-driver-timeout` runs after 2 min and broadcasts to the next batch. |
| Driver goes offline between query and offer | Their app ignores the offer; counted as no-response. |
| Two drivers accept simultaneously | First `accept` row update wins; second sees status not in `STORE_ACCEPTED`/`DRIVER_ASSIGNED` and returns `400`. |
| Order delivered/cancelled mid-broadcast | `rankDrivers` returns null when status moves past the eligible range. |

### Why BROADCAST vs CASCADE?

- **BROADCAST (default)** parallelizes the wait — a delivery that took 60s under cascade now completes in 5–10s typically.
- **CASCADE** is preferred when driver supply is low and you want predictable single-driver assignment for accountability.

Flip per env: `DRIVER_MATCHING_MODE=CASCADE`.

## Privacy interaction

The driver-assignment engine does not include any customer PII in the
`order:assigned` socket payload — only `orderId`, `distanceKm`, `score`. When
the driver opens the order, `GET /orders/:id` strips PII server-side; see
`docs/privacy.md`.
