# Tasks Log

Running log of work in progress and completed. Newest commits at the top of each section.

## Done

### 2026-05-07 — Cancelled-order rescue + Android stability + driver/store fixes

- [x] **Admin can rescue auto-cancelled orders** — when the matching engine cancels an order (no store accepts in 3 min), admin can now manually assign a store from the order detail page. The assign-store endpoint clears `cancelReason` and flips status to STORE_ACCEPTED. Frontend shows a yellow rescue banner explaining the situation. Same for driver assignment.
- [x] **Distinct cancel reasons** — matching service now writes "No store currently carries these items" (zero candidates) vs "No store accepted your order in time" (broadcast retry exhausted). Easier to know what actually went wrong.
- [x] **"No drivers online" empty state with contact CTAs** — when admin tries to assign a driver and nobody is online, shows a yellow "No driver is online right now" alert with one-tap call-customer / call-store buttons.
- [x] **Driver app crash fix (final)** — `import 'expo-notifications'` was being statically analyzed by Metro and bundled regardless of runtime guards, throwing in Expo Go. Now `require()` lives inside a `loadNotifications()` helper called per-function-entry. Detection broadened to also check `Constants.appOwnership`.
- [x] **Store-portal location picker** — store owners can finally set their lat/lng (was missing from profile/edit). Without coordinates, the matching engine can't find the store. UI: "Use current location" button via expo-location, plus manual lat/lng inputs with India-bounds validation (lat 6-38, lng 68-98).
- [x] **Driver "Active" tab fix** — backend `GET /admin/drivers?status=ACTIVE` now translates to `status IN ('OFFLINE','ONLINE')` since there's no actual ACTIVE enum value. After approval drivers go to OFFLINE; this finally makes them visible.
- [x] **Admin nav progress bar reliability** — old version patched `history.pushState` and tripped React's commit-phase setState rule. Replaced with a simpler pathname-watcher + CSS `.nav-progress` keyframe sweep. Fires on every navigation now.
- [x] **Android status bar overlap** — `app.json` for all 3 mobile apps now sets `android.statusBar: { translucent: false }` so headers don't render under the signal/battery icons.
- [x] **Bootstrap admin user docs** — production has no seed (correctly). Added a `psql INSERT` snippet to the deployment guide for the first admin user.
- [x] **Prod compose build context bug fix** — backend and admin Dockerfiles import from `../shared`, but compose had `context: ./backend` / `./apps/admin`. Now uses repo root with explicit `dockerfile:` paths.
- [x] **CLAUDE.md** — working notes file at repo root capturing the gotchas, conventions, and where-to-look pointers for future sessions.

### 2026-05-07 — Deployment audit + Android local-install guide

- [x] **Fixed prod docker-compose build context bug** — `backend` and `admin` services had `context: ./backend` and `./apps/admin` respectively, but both Dockerfiles import from `../shared` workspace package. Production builds would fail with "shared/package.json not found". Both now correctly use `context: .` + `dockerfile: ./backend/Dockerfile` like the dev compose. **Without this fix, `docker compose -f docker-compose.prod.yml up` errors out on first build.**
- [x] **Production "first admin user" SQL inserted into deployment guide** — production has no seed (correctly — seed creates fake test users). Added a `psql INSERT` snippet to create the bootstrap admin row right after `prisma migrate deploy`. Includes a "do NOT run prisma db seed in production" warning.
- [x] **nginx placeholder-domain replacement step** — `nginx/conf.d/*.conf` ships with `api.yourdomain.com` / `admin.yourdomain.com` as `server_name` placeholders. Added a `sed -i` one-liner step before `init-ssl.sh` so first-time deployers don't accidentally try to issue a cert for the placeholder.
- [x] **`docs/android-local-install.md`** — new guide with three install paths ranked by speed: (A) Expo Go QR scan for daily dev, (B) EAS Build → APK link → sideload (real install + working push), (C) local dev build for custom natives. Per-app folder/port/bundle-ID table. Test users to log in with. Per-app workflow recommendation. Troubleshooting table covering the 6 most-common failure modes. Cross-linked from `getting-started.md` and `deployment.md`.

### 2026-05-07 — HostLelo deployment guide (own provider)

- [x] **HostLelo product matrix** — every product they sell mapped to "runs our stack? yes/no". Cloud VPS / VDS / Dedicated all OK; Shared / WordPress / UAE Web Hosting all explicitly NO (cPanel, no Docker).
- [x] **Resource sizing for AKS** — measured idle + peak RAM per container; 4GB/2vCPU is the documented MVP floor, 8GB/4vCPU the launch target.
- [x] **Phase-aligned plan recommendations** — Beta (Cloud VPS 4GB ~$16.52/mo), Public launch (EPYC VDS 12GB ~$50/mo with managed support), Scale (Dedicated + separate Postgres box).
- [x] **End-to-end deployment walkthrough** for HostLelo: order → SSH → Docker check → SSH key auth → UFW → DNS → clone → .env.prod → SSL → first start → smoke test. Day-2 ops table included.
- [x] **Tiered cost estimates** in INR — Beta ~₹1,550/mo, Public launch ~₹5,200/mo, Scale ~₹15,000/mo. Replaces the flat estimate.
- [x] **HostLelo-specific gotchas** documented: Mumbai vs UAE region trade-off, snapshot vs pg_dump, managed-support tier when to skip vs buy, port 25 / PTR / DDoS protection notes.

### 2026-05-07 — Next.js 16 + Hostinger deployment docs

- [x] **Upgraded admin to Next.js 16.2.5** (was 15.1.0). Risk audit found our codebase already uses async `params: Promise<{id: string}>` patterns expected by 16.x; no `middleware.ts`, no `next/image`, no parallel routes — clean upgrade. Admin compiles + serves in 1.6s on Turbopack.
- [x] **Fixed admin NavProgressBar `useInsertionEffect must not schedule updates` error** — patched `history.pushState` was firing setState during React's commit phase. `queueMicrotask` wasn't enough (microtasks still inside commit window); switched to `setTimeout(0)` macrotask.
- [x] **Always-visible admin chat panel on order detail** — now shows an empty state ("No conversations yet for this order") when no chat exists, so admins know the feature is there. Was hidden entirely before.
- [x] **Customer transition overlay lifted to root layout** — was inside `login.tsx` so it disappeared when login unmounted. New `TransitionOverlay` + Zustand `transition.store` survive across navigation; auto-hides 2s after the next screen mounts.
- [x] **Hostinger VPS deployment guide** — new section in `docs/deployment.md` with step-by-step for KVM 2 Mumbai (₹499/mo): right plan to buy, Docker template, DNS records, firewall, gotchas. Recommended VPS table now lists Hostinger first for India.
- [x] **Pre-deployment checklist** — every account / asset you need before you `ssh` to the VPS, with sign-up links.
- [x] **Mobile app store submission guide** — EAS Build setup, internal TestFlight builds, production submission to App Store Connect / Play Console, iOS APNs key upload via `eas credentials`. Distinct bundle IDs spelled out.
- [x] **`.env.prod.example` updated** — adds SMS_PROVIDER + 2Factor/MSG91/Twilio creds, VAPID keys for web push, organized comments. Deployment doc references match.
- [x] **Cost estimate refreshed** — reflects Hostinger pricing, free Expo Push (was Twilio + Firebase). New low-volume floor: **~₹600/mo** total fixed.

### 2026-05-07 — Admin chat read-only view

- [x] **Admin can read chat threads on order detail** — new `GET /admin/orders/:id/chats` returns every Chat row for the order (could be 0–3) with full message history, participant names + roles + phones, message count, and Active/Closed/Archived state. Used for fraud / support investigation.
- [x] **Read-only chat panel on `/orders/[id]`** — new "Conversations" card lists each thread as a collapsible `<details>` block. Header shows participant labels (Customer ↔ Store / Customer ↔ Driver / Store ↔ Driver) plus an Active/Closed/Archived badge. Body shows each message with sender name, phone/role, timestamp, and the body in a chat-bubble style. 30s polling. No send UI — admin observes only.

### 2026-05-07 — Chat push + Postman

- [x] **Chat → push notification** — recipient's phone buzzes when a new chat message arrives. Uses the `CHAT_MESSAGE` templated event ("Sender (Order #ABC123) — preview"). Smart guard: skips the push if the recipient already has the chat screen open (Socket.io `chat:<id>` room membership check via `io.in().fetchSockets()`). Tap deep-links to `/chat/<orderId>` in all 3 mobile apps.
- [x] **Postman collection** — `docs/postman/apni-kirana-store.postman_collection.json` enumerates every endpoint (Auth/Users/Stores/Items/Catalog/Orders/Drivers/Notifications/Chats/Promos/Admin × ~70 requests) with example bodies. Test script on Verify OTP auto-captures the access token; on Place Order auto-captures the order id; on Resolve Chat auto-captures the chat id. `local.postman_environment.json` ships seed phones + baseUrl. README in the same folder.

### 2026-05-07 — Chat UI

- [x] **Chat thread screen in all 3 mobile apps** — same UX in customer / driver / store-portal: bubbles, sender alignment, timestamps, optimistic send, Socket.io live delivery, auto-scroll. Composer disables when chat is read-only (order in terminal state). Plain text only — no media for v1.
- [x] **"Chat with…" buttons** wired up: customer order screen → "Chat with store" / "Chat with driver" depending on PICKED_UP. Driver active-delivery card → "Chat with customer". Store-portal order detail → "Chat with customer/driver".
- [x] **Real-time fan-out verified** — backend `chat:message` socket event reaches the other party instantly; bell-style `chat:new` on `user:<recipient>` so the message lands even if the chat screen isn't open.

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

_Nothing in progress right now._

## Backlog (not started)

- [ ] **Customer order placement → live store-portal/driver lighting up** — verify e2e on real devices once Zaheer's default address is switched to a Delhi one (Baqala won't match Jaipur address, fallback runs but distance shows ~230 km).
- [ ] **Push notifications in production iOS** — needs Apple Developer account + APNs key uploaded to Expo.
- [ ] **Real OTP delivery** — set `SMS_PROVIDER=TWOFACTOR` + `TWOFACTOR_API_KEY` in `backend/.env` to switch from console-log to real SMS. Free 100/day forever. Step-by-step in `docs/deployment.md` § SMS OTP setup.
- [ ] **Number masking** — deferred in favor of in-app chat. Re-evaluate once chat is shipped; if still needed, Exotel/Knowlarity at ~₹0.50/min is the path.

## How this file is maintained

Add a new entry to `## Done` whenever a task ships. Move from `## In progress` when work starts; from `## Backlog` when it's planned. Keep entries one line — link to the relevant commit(s). Newer commits sit at the top of their day.
