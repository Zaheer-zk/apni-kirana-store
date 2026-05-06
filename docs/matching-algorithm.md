# Matching Algorithm

Two cascades govern the lifecycle of every order: **store matching** (who fulfills it?) and **driver assignment** (who delivers it?).

## Configuration constants

Defined in `apps/backend/src/config/matching.ts` and overridable via the admin Settings page.

| Constant | Default | Description |
| --- | --- | --- |
| `MAX_RADIUS_KM` | 8 | Maximum store search radius |
| `STORE_ACCEPT_TIMEOUT_MS` | 180_000 (3 min) | Per-store accept window |
| `DRIVER_RADIUS_KM` | 2 | Initial driver search radius |
| `DRIVER_RADIUS_KM_FALLBACK` | 5 | Expanded search if first pass fails |
| `DRIVER_ACCEPT_TIMEOUT_MS` | 60_000 (60 s) | Per-driver accept window |
| `DRIVER_RETRY_INTERVAL_MS` | 60_000 | Re-search interval after exhausted candidates |
| `DRIVER_MAX_RETRIES` | 5 | Caps the AWAITING_DRIVER backoff |
| `AVAILABILITY_WEIGHT` | 0.6 | Score weight for catalog availability |
| `PROXIMITY_WEIGHT` | 0.4 | Score weight for distance |

## Store matching

### Step 1 — Bounding box prefilter

Cheap filter on indexed `lat`/`lng` columns:

```ts
const dLat = MAX_RADIUS_KM / 111; // ~111 km per degree latitude
const dLng = MAX_RADIUS_KM / (111 * Math.cos(toRad(customerLat)));
const candidates = await prisma.store.findMany({
  where: {
    status: 'APPROVED',
    isOpen: true,
    category,
    lat: { gte: customerLat - dLat, lte: customerLat + dLat },
    lng: { gte: customerLng - dLng, lte: customerLng + dLng },
  },
  include: { items: { where: { id: { in: cartItemIds } } } },
});
```

### Step 2 — Haversine distance + radius cut

```ts
function haversine(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const within = candidates
  .map(s => ({ store: s, distanceKm: haversine(customer, s) }))
  .filter(c => c.distanceKm <= MAX_RADIUS_KM);
```

### Step 3 — Availability score

```ts
function availability(store, cart) {
  const matched = store.items.filter(i => i.available && i.stock >= cart.find(c => c.itemId === i.id)!.qty);
  return matched.length / cart.length; // 0..1
}
```

A store missing even one item still counts (partial fulfillment is rejected later) — this just nudges the score.

### Step 4 — Weighted score

```ts
function score(store, distanceKm, cart) {
  const availabilityScore = availability(store, cart);
  const proximityScore = 1 - (distanceKm / MAX_RADIUS_KM);
  return AVAILABILITY_WEIGHT * availabilityScore
       + PROXIMITY_WEIGHT * proximityScore;
}
```

Sort `within` by `score` descending. Stores that don't have **all** cart items are filtered out before the cascade (we don't split orders across stores in v1).

### Step 5 — Cascade with 3-minute timeout

```ts
for (const candidate of sortedFullMatches) {
  await offerToStore(candidate.store.id, orderId);
  emit(`user:${candidate.store.ownerId}`, 'order:new', { orderId, ... });
  const decision = await raceWithTimeout(
    waitForStoreDecision(orderId, candidate.store.id),
    STORE_ACCEPT_TIMEOUT_MS,
  );
  if (decision === 'ACCEPTED') {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'STORE_ACCEPTED', storeId: candidate.store.id }});
    return;
  }
  // REJECTED or TIMEOUT — try next
}
await prisma.order.update({ where: { id: orderId }, data: { status: 'STORE_UNAVAILABLE' }});
notifyCustomer(orderId, 'No store available');
```

The whole cascade runs as a BullMQ job so it survives backend restarts.

### Edge cases

| Case | Handling |
| --- | --- |
| Customer cancels mid-cascade | Job checks order status before each offer; aborts if `CANCELLED`. |
| Store toggles closed during the 3-min window | Counts as a reject; cascade moves on. |
| Store was approved but `openHours` says closed | Filtered out at step 1. |
| Tie on score | Broken by `distanceKm` ascending, then `Store.id` for determinism. |

## Driver assignment

Triggered by `PUT /orders/:id/ready`.

### Step 1 — Search radius

```ts
async function findDrivers(storeLat, storeLng, radiusKm) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos(toRad(storeLat)));
  const drivers = await prisma.driver.findMany({
    where: {
      status: 'ONLINE',
      approved: true,
      lat: { gte: storeLat - dLat, lte: storeLat + dLat },
      lng: { gte: storeLng - dLng, lte: storeLng + dLng },
    },
  });
  return drivers
    .map(d => ({ driver: d, distanceKm: haversine({ lat: storeLat, lng: storeLng }, d) }))
    .filter(c => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
```

### Step 2 — Cascade with 60-second timeout

```ts
let candidates = await findDrivers(store.lat, store.lng, DRIVER_RADIUS_KM);
let retries = 0;

while (true) {
  for (const c of candidates) {
    emit(`user:${c.driver.userId}`, 'order:assigned', { orderId, ... });
    const decision = await raceWithTimeout(
      waitForDriverDecision(orderId, c.driver.id),
      DRIVER_ACCEPT_TIMEOUT_MS,
    );
    if (decision === 'ACCEPTED') {
      await assignDriver(orderId, c.driver.id);
      return;
    }
  }
  // exhausted — expand and retry
  retries += 1;
  if (retries > DRIVER_MAX_RETRIES) {
    await markOrderAwaitingDriverFailed(orderId);
    return;
  }
  await sleep(DRIVER_RETRY_INTERVAL_MS);
  candidates = await findDrivers(store.lat, store.lng, DRIVER_RADIUS_KM_FALLBACK);
}
```

### Edge cases

| Case | Handling |
| --- | --- |
| Driver goes offline between query and offer | Offer still sent; client ignores it; treated as timeout. |
| Driver accepts then immediately rejects | First write wins (acceptance); second call returns 409. |
| Two drivers accept simultaneously | DB unique constraint on `(orderId, driverId)` plus row-level lock on Order ensures one wins. |
| Order cancelled mid-cascade | Job checks status before each offer; aborts on `CANCELLED`. |
| All drivers reject 5 cycles in a row | Order stays `AWAITING_DRIVER`; admin can manually assign or refund. |

## Why these defaults?

- **3-minute store window** — long enough for a busy shopkeeper to reach their phone, short enough that customers don't bail.
- **60-second driver window** — drivers usually decide in under 10s; 60s leaves headroom for slow networks.
- **2 km initial driver radius** — keeps food / groceries reaching customers in <15 min in dense urban areas.
- **0.6 / 0.4 score weights** — empirically biases toward stores that can actually fulfill, while still favouring close ones when availability is comparable.

All values are tunable in `Settings` without redeploy.
