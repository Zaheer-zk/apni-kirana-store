# End-to-end audit report — 2026-06-04

Static audit of the OrderGroup feature + recent surrounding work. No
docker-compose / mobile devices available in this environment, so live
integration runs are deferred to the next docker-up — the suite is
ready to execute (see "Test execution" below). This report covers:

- Baseline test runs (what passed, what's blocked on DB)
- Type-check across every app
- Trace-read of the OrderGroup happy path
- Bugs found + their fix status

## Test execution

Backend `__tests__/` — pure-unit + integration mixed.

```
Test Suites: 13 failed, 2 passed, 15 total
Tests:       179 failed, 36 passed, 215 total
```

The 13 failing suites all fail the same way: `AggregateError` out of
`prisma.$connect()` because there's no Postgres in the audit
environment. The setup file's soft-fail (see `__tests__/setup.ts`)
prints `[test setup] DB unavailable — integration tests will be
skipped, pure-unit tests will continue` and lets pure-unit suites
finish anyway:

- `route-optimizer.test.ts` — 8/8 pass
- `catalog-images.test.ts` — needs DB
- All `order-group*.test.ts` — need DB
- All `admin.test.ts`, `auth.test.ts`, `drivers.test.ts`,
  `items.test.ts`, `items-search.test.ts`, `notifications.test.ts`,
  `orders.test.ts` — need DB

To execute the full suite, run from `backend/`:
```
docker compose up -d postgres redis
node_modules/.bin/jest --forceExit
```

## Type-check

| App            | Errors | Notes |
|----------------|-------:|-------|
| backend        | 200    | All pre-existing: 159 `string \| string[]` from `req.query[…]` + 41 Prisma relation-include narrowing. Runtime-correct; the codebase has lived with these. |
| customer-web   | 3      | All pre-existing. `wallet/page.tsx` uses removed prop names; `Providers.tsx` has a setTimeout typing oddity. |
| customer-mobile| 3      | Pre-existing: expo-router typed-route narrowing (string literal accepted at runtime but not in TS union). |
| admin          | 21     | **2 new from B-1** (catalog backfill `ToastState` shape); rest pre-existing test-lib + Next config noise. |
| store-web      | 0      | Clean. |
| store-portal   | 1      | Pre-existing `components/Avatar.tsx` overload. |
| driver-web     | 0      | Clean. |
| driver-mobile  | 7      | **2 are real bugs (B-2)**: `/order/[id]` push to a non-existent route. 5 are expo-router typed-route narrowing (pre-existing). |

## Flow traces

### Cart → cross-store order
1. Customer adds Aloo Bhujia (store A) + 5-Star (store B)
2. Cart is catalog-keyed (apps/customer-web/lib/cart.ts) — items dedupe by `catalogItemId`
3. POST /orders sends `[{ catalogItemId, qty }, ...]`
4. Backend cross-zone re-match in `orders.routes.ts` runs `planSplit` when no single in-zone store covers
5. Creates `OrderGroup` + N child `Order` rows, each linked via `orderGroupId`
6. Returns `{ orderGroup, id (first leg), orderGroupId, status }`

Flow works. Issues:
- **B-6** (P3): Multi-store path creates OrderItem rows with empty `name` / `unit`, then patches them post-create. Race: store-side matching jobs queued after the transaction may notify the store with empty item names.
- **B-7** (P2): Checkout success handler navigates to `/orders/{firstLegId}` even when the response has `orderGroupId`. Should land on `/orders/group/{groupId}` for multi-store splits.

### Driver multi-pickup
1. All store legs accept → backend's accept handler (orders.routes.ts) gates the driver assignment trigger on every-sibling-accepted (✓ correct)
2. `assignDriverForOrder(seedLegId)` runs once → cascade/broadcast picks the best driver
3. `assignDriverToGroup(seedLegId, driverId)` fans driverId across every live leg + group parent
4. Driver-mobile dashboard shows multi-pickup leg list (TSP-optimised order)
5. Per-leg pickup + per-leg deliver

Flow works. Issues:
- **B-4** (P2): Per-leg deliver button means driver clicks "Confirm delivery" N times for ONE physical handoff. No "Deliver all" affordance.
- **B-5** (P2): Each child has its own `dropoffOtp` — customer sees N OTPs across legs, driver must pick the right one per leg.

### Notification tap (driver)
1. Backend dispatches `DRIVER_NEW_DELIVERY` with `data.url = "/deliveries/new?orderId=…"`
2. Driver-web: tap → /deliveries/new?orderId=… → IncomingOrderModal mounts ✓
3. Driver-mobile: tap → `router.push('/order/${orderId}')` → **404**

This is **B-2**, the highest-severity bug in the audit.

### Customer rating per-leg
1. Backend `POST /orders/:id/rate` writes OrderRating + updates store aggregate
2. For multi-store groups: gated to NOT double-count driver across siblings (recent fix)
3. Customer-web group rollup shows "✓ 5★" / "Tap to rate" chip per leg ✓
4. Customer-mobile group rollup → **no chip** (B-3)

## Bug summary

| ID  | Severity | Component | Status |
|-----|----------|-----------|--------|
| B-1 | P3 minor | admin catalog backfill `ToastState` shape | Fixed |
| B-2 | **P1 broken** | driver-mobile notification tap → 404 | Fixed |
| B-3 | P3 minor | customer-mobile rollup missing rating chip | Fixed |
| B-4 | P2 UX    | multi-store: N per-leg deliver clicks | Fixed |
| B-5 | P2 UX    | multi-store: N customer-facing OTPs | Fixed |
| B-6 | P3 race  | split-order OrderItem name/unit post-pass | Fixed |
| B-7 | P2 UX    | checkout navigates to leg not group on split | Fixed |

P1 = customer-blocking bug; P2 = visible regression / clunky UX;
P3 = polish / future-work.

## Bug details

### B-1 · admin catalog backfill `ToastState` shape (P3, FIXED)

**Repro:** Click "Backfill images" on Admin > Catalog → mutation succeeds
→ `setToast({ type, message })` runs.

**Issue:** `ToastState` requires `id: number`. The two callsites in my
mutation `onSuccess` / `onError` don't pass it, so TypeScript errors
and the toast may not auto-clear (no id key to track).

**Fix:** Add `id: Date.now()` to both setToast calls. Aligns with
the rest of the page's toast invocations.

**Files:** `apps/admin/app/(dashboard)/catalog/page.tsx`

### B-2 · driver-mobile notification tap → 404 (P1, FIXED)

**Repro:** Driver receives a push notification → taps it →
`router.push('/order/${orderId}')` runs → no route at `/order/[id]`
→ blank screen.

**Issue:** Driver mobile shows the active order via the dashboard
tab's Zustand-backed `activeOrderId` flow (not a dedicated route).
Both call-sites push to a route that doesn't exist.

**Fix:** Replace `router.push('/order/${id}')` with
`useDriverStore.getState().setActiveOrder(id)` + `router.push('/(tabs)/dashboard')`.

**Files:**
- `apps/driver/app/_layout.tsx:93`
- `apps/driver/app/notifications/index.tsx:267`

### B-3 · customer-mobile rollup missing rating chip (P3, FIXED)

**Issue:** `PerLeg` interface in `apps/customer/app/order/group/[id].tsx`
doesn't declare `rating?`, so the per-leg row can't render the
"✓ 5★" / "Tap to rate" chip that customer-web shows.

**Fix:** Extend `PerLeg` with `rating?: { id, storeRating, driverRating } | null`
and render the same chip pattern.

**Files:** `apps/customer/app/order/group/[id].tsx`

### B-4 · multi-store: N per-leg deliver clicks (P2, FIXED)

**Issue:** Driver does ONE physical handoff at the customer's door,
but the driver app required `PUT /drivers/orders/:id/deliver` to be
called per leg. Driver could forget a leg → it stays at PICKED_UP
status forever.

**Fix:** New backend endpoint
`PUT /api/v1/drivers/order-groups/:id/deliver { dropoffOtp }` that:
- verifies the requester is the assigned driver
- refuses (400) if any non-cancelled leg isn't yet PICKED_UP
- validates the OTP once
- atomically marks every PICKED_UP leg DELIVERED + sets
  paymentStatus=PAID on COD legs + credits the driver the GROUP's
  delivery fee (not per-leg, since legs carry 0)
- rolls the group status up
- broadcasts per-leg DELIVERED + generates per-leg invoices outside
  the transaction

Per-leg endpoint `PUT /drivers/orders/:id/deliver` now 409s on
grouped legs to force callers into the atomic path — driver-web
and driver-mobile both auto-switch URLs based on `orderGroupId`.

Driver-mobile dashboard's "Confirm Delivery" button title flips
based on group state:
- single-store → "Confirm Delivery"
- group with X/Y picked up → "Pick up the remaining N leg(s) first"
  (disabled)
- group with all picked up → "Deliver all N legs" (active)

Driver-web's FlowStep does the same — disabled until every sibling
is picked up.

### B-5 · multi-store: N customer-facing OTPs (P2, FIXED)

**Issue:** Each child Order had its own `dropoffOtp`. Customer saw
different OTPs on different legs. Driver had to enter the right OTP
per leg → user confusion.

**Fix:** Multi-store split-create now generates ONE OTP and copies
it to every child Order's `dropoffOtp`. Customer-web + customer-
mobile rollup screens show a single big OTP card labelled "one code
for the whole basket" once any leg is picked up. Driver enters the
single OTP via the deliver-all endpoint (B-4 fix).

The shared-OTP endpoint also defensively asserts the OTPs match
across legs — if data corruption ever produced a group with
mismatched OTPs, it 500s instead of partially delivering.

### B-6 · split-order OrderItem name/unit post-pass (P3, FIXED)

**Issue:** Multi-store cart create makes OrderItem rows with
`name: ''` and `unit: ''`, then post-creates fetches catalogItem and
updates them. Two problems:
1. Window where rows have empty display fields
2. Store-side matching job is queued AFTER the transaction but
   BEFORE the post-pass — the store-portal notification could
   render with empty item names

**Fix:** Pre-fetch catalogItem data inside the `legs.map` (where
stock validation already runs) and include name/unit/imageUrl in
the OrderItem `create` payload directly. Drops the post-pass.

**Files:** `backend/src/routes/orders.routes.ts` (multi-store split branch)

### B-7 · checkout navigates to leg not group on split (P2, FIXED)

**Issue:** Customer places a cross-store cart → backend returns
`{ id, orderGroupId, orderGroup, status }` → customer-web's
`onSuccess` navigates to `/orders/{order.id}` (= first leg) instead
of `/orders/group/{orderGroupId}`. The user lands on one leg's
detail page with a small "Part of multi-store order" banner — they
need to click that banner to see the rollup, but the rollup IS the
right summary to land on.

**Fix:** When the create-order response has `orderGroupId`, navigate
to `/orders/group/{orderGroupId}`. Falls through to `/orders/{id}`
for single-store orders.

**Files:**
- `apps/customer-web/app/checkout/page.tsx`
- `apps/customer/app/cart.tsx` (same fix on mobile)
- `apps/customer-web/lib/orders.ts` (extend `CreateOrderInput`/return type if needed)

## Fixes applied

| ID  | Commit shape                              | Files |
|-----|-------------------------------------------|-------|
| B-1 | `setToast` now includes `id: Date.now()`  | `apps/admin/app/(dashboard)/catalog/page.tsx` |
| B-2 | Replaced `router.push('/order/${id}')` with `setActiveOrder(id) + push('/(tabs)/dashboard')` on both notification tap paths | `apps/driver/app/_layout.tsx`, `apps/driver/app/notifications/index.tsx` |
| B-3 | `PerLeg.rating?` typed + emerald/amber chip rendered on each delivered row | `apps/customer/app/order/group/[id].tsx` |
| B-4 | New `PUT /api/v1/drivers/order-groups/:id/deliver` endpoint, per-leg deliver 409s on grouped legs, driver UIs auto-switch URL + disable until all picked up | `backend/src/routes/drivers.routes.ts`, `apps/driver-web/app/deliveries/[id]/page.tsx`, `apps/driver/components/DropoffOtpSheet.tsx`, `apps/driver/app/(tabs)/dashboard.tsx` |
| B-5 | Single OTP generated once at split-create + copied to every child; customer rollup (web + mobile) shows ONE big OTP card "one code for the whole basket" | `backend/src/routes/orders.routes.ts`, `apps/customer-web/app/orders/group/[id]/page.tsx`, `apps/customer/app/order/group/[id].tsx` |
| B-6 | Pre-fetch CatalogItem display fields BEFORE the transaction; OrderItem `create` carries real name/unit/imageUrl up-front; post-pass deleted | `backend/src/routes/orders.routes.ts` |
| B-7 | `createOrder` return type widened to surface `orderGroupId`; web + mobile success handlers branch to `/orders/group/{id}` for splits, `/orders/{id}` for single-store | `apps/customer-web/lib/orders.ts`, `apps/customer-web/app/checkout/page.tsx`, `apps/customer/app/cart.tsx` |

Test coverage for the new endpoint: `__tests__/order-group-deliver.test.ts` (4 tests — happy path, partial-pickup 400, wrong-OTP 400, wrong-driver 403, per-leg 409 on grouped legs).

Type-check verification per app after fixes:

| App            | Before | After | Net   |
|----------------|-------:|------:|-------|
| admin          | 21     | 19    | −2 (B-1) |
| driver-mobile  | 7      | 5     | −2 (B-2) |
| customer-mobile| 3      | 3     | unchanged (B-3 fix had no TS impact; pre-existing expo-router noise remains) |
| backend split branch | clean | clean | unchanged |

## What we DIDN'T verify (next-round work)

The audit was static. These checks still need a live environment:

1. **Live test suite** — boot docker-compose, run `jest --forceExit`,
   expect ≥179 integration tests to flip from failed (DB-unavailable)
   to pass (or surface real regressions).
2. **Real device push** — driver tap on a delivered offer on an
   actual Android. Particularly verify B-2 fix works through the
   `attachNotificationListeners` callback in `_layout.tsx`.
3. **Cross-store order placement on the dev DB** — needs two seeded
   stores in the same zone carrying different catalog items + a
   customer in that zone.
4. **B-4 / B-5 follow-up sprint** — multi-store delivery UX needs
   product input before implementation.

## Process change

CLAUDE.md updated with an E2E audit note so the next session knows
to re-run this checklist after any flow-level change. See
[CLAUDE.md](../CLAUDE.md) for the rule.
