# Tasks Log

Running log of work in progress and completed. Newest commits at the top of each section.

## Done

### 2026-05-07 — UX polish (continued)

- [x] **Customer login → home redirect overlay** — branded full-screen "Welcome back, {name}!" + spinner stays up through navigation so there's no white flash between OTP verify and home. Commit `022c6d6`.
- [x] **Admin top progress bar** — thin animated bar at the top of the page during route changes. Hooks into `history.pushState` / `popstate` for instant feedback, completes when the new route renders. No external deps.
- [x] **Admin route loading skeleton** — `app/(dashboard)/loading.tsx` shows a shimmer skeleton (KPI cards + list rows) immediately while the next route compiles in dev mode. All dashboard routes inherit it via App Router.
- [x] **Shimmer animation utility** — new `.shimmer` Tailwind class (admin) with a translating gradient sweep. Replace any `animate-pulse bg-gray-200` with `shimmer` for a livelier loading state.
- [x] **Customer Skeleton upgraded with shimmer** — was a simple opacity pulse, now sweeps a translucent highlight across the bar (no extra deps, native `Animated`).

### 2026-05-07 — Notifications, perf, manual assign, order flow

- [x] **Push notifications end-to-end** — Expo Push (mobile, free, no Firebase) + Web Push (admin browser, VAPID). 22-event templated `notify()` with per-user `NotificationPreferences` opt-out. `notifyAdmins()` helper for platform-wide broadcasts. Commit `13e9a43`.
- [x] **Push token crash fix** — `getExpoPushTokenAsync()` was throwing on missing EAS projectId, crashing the app on launch. Now degrades gracefully with a console warn. Commit `9692a16`.
- [x] **Cancel order bug** — was hitting `/orders/undefined/cancel`. Fixed argument shape. Commit `9692a16`.
- [x] **Operating hours "store id missing"** — added `GET /stores/me`; store-portal lazy-fetches if profile not in memory. Commit `9692a16`.
- [x] **Customer registration flow** — first-time customers (no name) get a "Tell us your name" step before onboarding. `verify-otp` accepts optional `name`. Commit `9692a16`.
- [x] **Restrict store/driver auto-creation** — OTP login refuses to create users with role STORE_OWNER or DRIVER. Those must be provisioned by an admin. Also blocks role mismatch (e.g. customer phone trying to log into store-portal). Commit `9692a16`.
- [x] **Dispatch engine uses templated `notify()`** — STORE_NEW_ORDER, STORE_ORDER_OFFERED, STORE_ORDER_RESCINDED — preferences honored. Commit `9692a16`.
- [x] **Admin manual assign** — order detail page lists eligible stores (filtered by items + ranked by match% then distance) and eligible drivers (ONLINE, ranked by distance from store). Each row has owner/user phone with tap-to-call. New endpoints: `GET /admin/orders/:id/eligible-stores`, `GET /admin/orders/:id/eligible-drivers`. Commit `57d11ba`.
- [x] **Admin assign endpoints upgraded** — now use templated `notify()` so the store owner / driver actually receives a push (was only writing a DB row). Commit `57d11ba`.
- [x] **Speed up customer login → home** — parallel SecureStore writes; `verify-otp` returns `hasAddress` so the client doesn't need a separate `/addresses` round-trip.
- [x] **Admin panel perf** — QueryClient now has `staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false`. AuthGuard no longer flashes a spinner on every navigation.
- [x] **Admin notified when customer places order** — new `ADMIN_ORDER_PLACED` event; fired via `notifyAdmins()` after order creation with customer name, item count, total, city. Notification bell click deep-links to `/orders/{id}`.
- [x] **Existing admin notifications backfilled** — old "New store/driver awaiting approval" rows now have `data.storeId` / `data.driverId` so clicking routes correctly. Seed updated to populate `data` going forward.
- [x] **Zone map centers on city** — typing a city in the zone form auto-centers the map. Local lookup for ~30 major Indian cities (instant), Nominatim fallback for others (debounced 600ms). User-pinned location takes priority over auto-fill.

## In progress

_Nothing in progress right now._

## Backlog (not started)

- [ ] **Customer order placement → live store-portal/driver lighting up** — verify e2e on real devices once Zaheer's default address is switched to a Delhi one (Baqala won't match Jaipur address, fallback runs but distance shows ~230 km).
- [ ] **Push notifications in production iOS** — needs Apple Developer account + APNs key uploaded to Expo.
- [ ] **Multi-device push tokens** — currently only one token per user; add a Devices table for users on multiple phones.
- [ ] **Notification logout cleanup** — clear FCM token / unsubscribe web push on logout to stop pushes to logged-out devices.

## How this file is maintained

Add a new entry to `## Done` whenever a task ships. Move from `## In progress` when work starts; from `## Backlog` when it's planned. Keep entries one line — link to the relevant commit(s). Newer commits sit at the top of their day.
