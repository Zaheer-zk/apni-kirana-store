# Tasks Log

Running log of work in progress and completed. Newest commits at the top of each section.

## Done

### 2026-05-07 — Chat + multi-device + SMS docs

- [x] **Multi-device push tokens** — new `Device` table + per-device fan-out. `notify()` reads `Device.findMany` instead of single `User.fcmToken`; failed tokens delete just that device row (not the user). Logout removes only the current device's token (other phones stay subscribed). Migration backfills existing tokens. Commit `31a9062`.
- [x] **Chat backend** — `Chat` + `ChatMessage` Prisma models, routes (`GET /chats/order/:orderId`, `GET /chats/:id/messages`, `POST /chats/:id/messages`), Socket.io `chat:join` / `chat:message` events. Gating: send-blocked unless order is `STORE_ACCEPTED`/`DRIVER_ASSIGNED`/`PICKED_UP`. Auto-closes chats when order ends. Plain-text storage (intentional, for fraud review). Retention sweep on backend startup + every 6h: soft-delete 30d after order close, hard-delete after 90d.
- [x] **SMS OTP setup docs** — `docs/deployment.md` now has a step-by-step guide for 2Factor.in (free 100/day), MSG91, Twilio and the dev CONSOLE fallback, with sign-up links and exact env keys.

### 2026-05-07 — Production hardening

- [x] **Notification logout cleanup** — all 4 apps (customer/driver/store-portal/admin) now call `DELETE /notifications/fcm-token` (and admin additionally unsubscribes web push) before clearing local credentials, so a logged-out device stops receiving pushes meant for the previous user. New backend endpoint `DELETE /api/v1/notifications/fcm-token`.
- [x] **SMS provider abstraction** — new `services/sms.service.ts` with pluggable adapters: `CONSOLE` (dev), `TWOFACTOR` (2Factor.in, 100/day free forever), `MSG91` (Indian, ~₹0.18/OTP), `TWILIO`. Switch via `SMS_PROVIDER` env var; failed sends in dev silently fall back to console so the dev flow never breaks. .env.example updated with all four sets of vars.
- [x] **Shimmer Skeleton in driver + store-portal** — both apps now share the same animated-sweep `<Skeleton />` as customer (was a static `bg-gray-200` placeholder).

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

- [ ] **Chat UI in customer/driver/store-portal** — backend is live; need a "Chat with {customer/store/driver}" button on the active-order screen that opens a thread (Socket.io powered; backend already broadcasts `chat:message`).

## Backlog (not started)

- [ ] **Customer order placement → live store-portal/driver lighting up** — verify e2e on real devices once Zaheer's default address is switched to a Delhi one (Baqala won't match Jaipur address, fallback runs but distance shows ~230 km).
- [ ] **Push notifications in production iOS** — needs Apple Developer account + APNs key uploaded to Expo.
- [ ] **Real OTP delivery** — set `SMS_PROVIDER=TWOFACTOR` + `TWOFACTOR_API_KEY` in `backend/.env` to switch from console-log to real SMS. Free 100/day forever. Step-by-step in `docs/deployment.md` § SMS OTP setup.
- [ ] **Number masking** — deferred in favor of in-app chat. Re-evaluate once chat is shipped; if still needed, Exotel/Knowlarity at ~₹0.50/min is the path.

## How this file is maintained

Add a new entry to `## Done` whenever a task ships. Move from `## In progress` when work starts; from `## Backlog` when it's planned. Keep entries one line — link to the relevant commit(s). Newer commits sit at the top of their day.
