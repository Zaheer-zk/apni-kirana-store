# Tasks Log

Running log of work in progress and completed. Newest commits at the top of each section.

## Done

### 2026-05-24 — Store web app (`apps/store-web`) Slice 1 + PWA + LocationMap in @aks/ui

- [x] **`apps/store-web`** — new Next.js 16 + React 19 app at `store.quickeasymart.com`. Slice 1: auth (`/login` password + OTP, 3-step `/register` with account → OTP → store-detail form including map picker, `/forgot-password`, `/reset-password?token=`, `/change-password?next=`), `/` dashboard (today's pending/orders/completed/revenue tiles + active orders list + quick links), `/orders` tabs (Pending/Accepted/Picked up/Completed), `/orders/[id]` detail with accept/reject Dialog + mark-ready, `/inventory` list with inline edit Dialog + availability toggle, `/inventory/browse-catalog` master-catalog browse with "Add to my store" Dialog, `/profile` + `/profile/edit`. Mirrors `apps/customer-web` and `apps/driver-web` structurally; auth tokens stored under `aks_store_*` keys so customer/store/driver web sessions stay isolated on shared devices.
- [x] **PWA** — installable. `app/manifest.ts` emits the manifest with `display:'standalone'`, `start_url:'/'`, `theme_color:'#16A34A'`. `public/sw.js` is a small navigation-first service worker registered from `components/PwaRegister.tsx`; API requests deliberately bypass the cache (always live). Placeholder 192×192 + 512×512 green-tile icons in `public/icons/` (swap with real artwork later, same filenames). Nginx vhost sets `no-cache` on `/sw.js` and keeps Lighthouse PWA criteria passing.
- [x] **Backend endpoints** — added `GET /api/v1/stores/me/items` (inventory for the signed-in owner, sugar over `/stores/:id/items`) and `GET /api/v1/stores/stats/today` (today's snapshot: ordersReceived / ordersCompleted / revenue / pending). The Expo store-portal was already calling `/stores/stats/today` — now it actually exists.
- [x] **Shared types** — added `StoreOrder`, `StoreOrderLineItem`, `StoreDashboardStats`, `OrderDetail`, `OrderStatusEvent`, `StoreInventoryItem`, `CatalogItemRow` to `shared/src/types.ts`. The Expo store-portal already imports `StoreOrder`/`OrderDetail` by name — they're now actually exported instead of silently resolving to `any`.
- [x] **`@aks/ui` LocationMap** — new `<LocationMap />` component that **defaults to the device's current GPS position before mounting the tile layer**, with `fallback` for the saved coordinates and Delhi centre as a last resort. Re-used by store-web's registration map and profile/edit map; customer-web and driver-web can drop it in too. Leaflet + react-leaflet are declared as optional peer deps so apps that don't need a map don't pay the bundle cost.
- [x] **Docker / nginx / env** — new `store-web` service in `docker-compose.prod.yml` (build context = monorepo root, build arg = `${NEXT_PUBLIC_API_URL_STORE}`). New `nginx/conf.d/store.conf` for `store.quickeasymart.com` using the combined Let's Encrypt cert at `live/api.quickeasymart.com/`. Added `NEXT_PUBLIC_API_URL_STORE` to `.env.prod.example`. Added `apps/store-web` to root `workspaces`.
- [x] **Docs** — `docs/store-web.md` (Slice-1 scope + new backend endpoints + PWA install instructions for Android Chrome and iOS Safari + deploy steps).

### 2026-05-24 — Driver web app (`apps/driver-web`) Slice 1 + PWA

- [x] **`apps/driver-web`** — new Next.js 16 + React 19 app at `driver.quickeasymart.com`. Slice 1: auth (`/login` password + OTP, 2-step `/register` with vehicle/licence form, `/forgot-password`, `/reset-password?token=`, `/change-password?next=`, `/pending` approval-pending screen), `/` dashboard (greeting + online toggle + today stats + active-delivery card with pickup/drop "Open in Maps" links + recent earnings), `/deliveries` history list, `/profile` (avatar / rating / vehicle / lifetime stats + edit display name). Mirrors `apps/customer-web` structurally — same Dockerfile pattern, same `@aks/ui` consumption, same `lib/api.ts` + `lib/auth.ts` shape. Auth tokens stored under `aks_driver_*` to keep customer/store/driver web sessions isolated on shared devices.
- [x] **PWA** — installable. `app/manifest.ts` emits the manifest with `display:'standalone'`, `start_url:'/'`, `theme_color:'#16A34A'`. `public/sw.js` is a small navigation-first service worker registered from `Providers.tsx`; pre-caches `/offline.html` + icons. Placeholder 192 / 512 / 512-maskable green-tile icons in `public/icons/` (swap with real artwork later, same filenames). Nginx vhost sets `Service-Worker-Allowed: /` and no-cache on `/sw.js`.
- [x] **No background GPS on web** — documented as an explicit non-goal. Live-location remains in the Expo `apps/driver` app via `expo-task-manager`. The web dashboard is companion-only.
- [x] **Shared types** — added `DailyDriverStats`, `DriverDelivery`, `DriverEarningsSummary`, `DriverEarningsEntry` to `shared/src/types.ts` (the driver Expo app was already importing these by name — they're now actually exported).
- [x] **Backend CORS** — `config/env.ts` now splits `CORS_ORIGIN` on commas so the API can accept browser requests from `admin / customer / store / driver` subdomains simultaneously. `.env.prod.example` shows the full comma-separated list.
- [x] **Docker / nginx / env** — new `driver-web` service in `docker-compose.prod.yml` (build context = monorepo root, build arg = `${NEXT_PUBLIC_API_URL_DRIVER}`). New `nginx/conf.d/driver.conf` for `driver.quickeasymart.com` using the combined Let's Encrypt cert at `live/api.quickeasymart.com/`. Added `NEXT_PUBLIC_API_URL_DRIVER` to `.env.prod.example`. Added `apps/driver-web` to root `workspaces`.
- [x] **Docs** — `docs/driver-web.md` (Slice-1 scope + screen ↔ Expo mapping + deploy + PWA install + the "no background GPS" note).

### 2026-05-23 — Customer web storefront Slice 1 + shared @aks/ui library

- [x] **`packages/ui`** — new workspace with shadcn/ui components (Button, Input, Label, Card, Dialog, Sheet, DropdownMenu, Tabs, Badge, Select, Skeleton, Separator, Avatar, InputOTP, Sonner), a Tailwind preset extending brand tokens from `apps/customer/constants/theme.ts`, and `styles.css` defining the shadcn HSL variables. All three upcoming web apps consume `@aks/ui` — see `packages/ui/README.md` and `docs/web-apps.md`.
- [x] **`apps/customer-web`** — new Next.js 16 + React 19 app for `quickeasymart.com`. Slice 1 ships: auth (`/login` with password + OTP, `/register`, `/forgot-password`, `/reset-password?token=`, `/change-password?next=`), home (hero + search + trending + recommended), `/search?q=&sort=recommended|cheapest|nearest`, `/item/[storeItemId]`, single-store `/cart` with a "Switch store?" dialog when a customer adds an item from a second store. Cart state in zustand + persisted to localStorage under `aks-customer-cart`; auth in localStorage under `aks_customer_*`.
- [x] **Backend `services/ranking.service.ts`** — extracted composite scoring formula (0.4·price + 0.3·distance + 0.2·rating + 0.1 preferred boost). Documented in `docs/ranking-algorithm.md` with weights rationale + tunable knobs.
- [x] **Backend `GET /api/v1/items/search`** — now accepts `lat&lng&radius&sort` for location-aware ranking via `ranking.service`; the legacy `q&category` mode is preserved for the mobile customer app. Excludes wholesalers + closed stores. New endpoint `GET /api/v1/items/:id` returns the StoreItem joined with CatalogItem + Store (and `distanceKm` when caller passes lat/lng).
- [x] **Tests** — `backend/__tests__/items-search.test.ts` covers recommended / cheapest / nearest sorts, radius filter, wholesaler + closed-store exclusion, and the new `/items/:id` endpoint.
- [x] **Docker / nginx** — `apps/customer-web/Dockerfile` mirrors `apps/admin/Dockerfile` exactly with `ARG NEXT_PUBLIC_API_URL` in the builder stage. Added `customer-web` service to `docker-compose.prod.yml` (build context = monorepo root, build arg sourced from `${NEXT_PUBLIC_API_URL_CUSTOMER}`). New vhost `nginx/conf.d/customer.conf` for `quickeasymart.com` (with `www→apex` redirect) using the combined Let's Encrypt cert at `live/api.quickeasymart.com/`. Added `NEXT_PUBLIC_API_URL_CUSTOMER` to `.env.prod.example`.
- [x] **Docs** — `docs/customer-web.md` (Slice-1 scope + deploy + what's next), `docs/web-apps.md` (the pattern store-web / driver-web will follow), `docs/ranking-algorithm.md` (formula + weights + references).

### 2026-05-23 — Role-isolation refactor — separate User row per (phone, role)

- [x] **Schema** — dropped `phone @unique`; added `@@unique([phone, role])` (migration `20260523_isolate_roles`). One phone can hold CUSTOMER + STORE_OWNER + DRIVER simultaneously, but each is its OWN row with its own `name`/`email`/`username`/`password`. No more shared profile across roles — fixes the bug where registering CUSTOMER on an admin's number showed the admin's name.
- [x] **`/auth/register`** — lookup is now `findUnique({phone_role})`; registering a new (phone, role) creates a fresh row instead of grant-roling. Email/username uniqueness stays global.
- [x] **`/auth/verify-otp`** — looks up the (phone, role) row directly; the Redis pending-role machinery is gone.
- [x] **`/auth/login`** — phone identifier now requires `role` to disambiguate; username login unchanged (username unique).
- [x] **`POST /admin/users`** — creates a new (phone, role) row; the role-additive path and suspended-account guard are obsolete.
- [x] **`PUT /admin/users/:id`** — roles are no longer editable (one role per row).
- [x] **`/stores/register`, `/drivers/register`** — now require `authorize('STORE_OWNER'|'DRIVER')`; no longer grant a role to the caller.
- [x] **Tests** — full suite 161/161.

### 2026-05-23 — Production-safe Indian catalog seed

- [x] **`prisma/seed-catalog.ts`** — adds ~170 generic kirana items (staples/dals, spices, dairy, fresh produce, snacks, beverages, household, OTC medicine). Upsert-by-name only, no fake users, no deletes — safe to run on prod. Wire: `db:seed-catalog` npm script; on prod run `docker compose exec backend npx tsx prisma/seed-catalog.ts`.

### 2026-05-22 — Maps on every location touchpoint

- [x] **Admin maps** — new reusable `LocationMap` Leaflet component (picker + read-only modes, mirrors `ZoneMapPicker`'s SSR-safe setup). Store edit form gets a click/drag location picker (synced with the lat/lng inputs); store detail page shows the store on a read-only map; driver edit modal shows the driver's last-known GPS position (or a placeholder when none).
- [x] **Store-portal map** — the store-profile edit screen replaced its text lat/lng inputs with a `react-native-maps` pan-to-set picker + GPS recenter + reverse-geocoded address, matching the registration screen. (Customer address screens, customer order tracking, store-portal registration and admin zones already had maps.)

### 2026-05-22 — Admin can edit store & driver details

- [x] **`PUT /admin/stores/:id`** — admin edits a store's name/description/category/location/address/hours (status, open, wholesaler, preferred keep their own endpoints). **`PUT /admin/drivers/:id`** — admin edits a driver's vehicle type / number / licence. Both write `AuditLog` rows (`STORE_UPDATE`, `DRIVER_UPDATE`).

### 2026-05-22 — Register an extra role on a known number

- [x] **Role-additive registration** — `POST /auth/register` on a number that already has a (verified, active) account no longer 409s; it sends an OTP, and `verify-otp` grants the new role (Redis `addrole:` marker proves it's a deliberate role-add, so login stays strict). One number can become CUSTOMER + STORE_OWNER + DRIVER — and works even when the number is an admin's. Duplicate role and suspended accounts are still rejected. The existing account keeps its own name/email/username/password.

### 2026-05-22 — Super admin + create-user role-add

- [x] **Super admin** — new `User.isSuperAdmin` flag (migration `20260522_super_admin`, sets it on `zaheerzk`). A super admin is an ADMIN that can additionally create ADMIN accounts (`POST /admin/users` now accepts `role: ADMIN`, gated to super admins) and edit/suspend other admins. The super admin account itself can't be suspended or deactivated. The flag is never assignable via the API — exactly one super admin by design. Admin web: the Add-User dialog shows "Admin" only to the super admin; a forced `/change-password` page handles the temp-password new-admin gets.
- [x] **create-user is role-additive** — `POST /admin/users` for a phone that already exists now grants the requested role to that account instead of rejecting it (one number = one of each of CUSTOMER/STORE_OWNER/DRIVER). Only a true duplicate role 409s; ADMIN still requires a fresh number.

### 2026-05-22 — Audit log shows the acting admin

- [x] **Audit logs name the admin** — `GET /admin/audit-logs` now resolves each row's `actorId` to the admin's name + username (multiple admins exist). The admin Audit Logs page shows "Admin" (name + @username) instead of a raw id, in both the table and the diff modal; the timestamp column already shows relative + exact time. Added the new `USER_CREATE` / `USER_UPDATE` / `USER_RESET_CREDENTIALS` actions to the filter dropdown.

### 2026-05-22 — Auth system Phase 4 (app UIs)

- [x] **Admin web** — public `/reset-password` page (validates the emailed token, sets a new password); Users page gained Add user (create + temp-password reveal), Edit (name/phone/email/roles/active) and Reset (emails a reset link), multi-role badges, email/username columns, `?role=` filter.
- [x] **Customer app** — rewrote `(auth)`: login with a Password/OTP toggle, `register` (name/phone/email/username/password → OTP), `forgot-password`, and a forced `change-password` screen for admin-created accounts. Shared `AuthScaffold` + `OtpInput` components and a `persistSession` helper. `AuthGate` updated to allow unauthenticated register/forgot screens.
- [x] **Store-portal + driver apps** — same four auth screens, adapted: role `STORE_OWNER`/`DRIVER`, namespaced storage keys, two-part registration (account → OTP → existing store-detail / vehicle-detail step), and each app's existing post-login routing (store setup, driver `pending`) preserved.

### 2026-05-22 — Auth system Phase 3 (admin user management)

- [x] **Admin creates users** — `POST /admin/users` (name, phone, email, username, role) creates a phone-verified account with a readable temp password (returned once) and `mustChangePassword`. The user is forced to set their own password on first login.
- [x] **Admin edits users** — `PUT /admin/users/:id` updates name / phone / email / isActive / roles (grant or revoke roles); blocks editing ADMIN accounts and self-deactivation; uniqueness-checked. `GET /admin/users/:id` returns full detail incl. linked store/driver.
- [x] **Admin resets credentials** — `POST /admin/users/:id/reset-credentials` emails the user a reset link (reuses the Phase 2 reset-token flow). `GET /admin/users` now returns email/roles/username/flags and supports `?role=` filter. All three actions write `AuditLog` rows.
- [x] **Tests** — 9 new admin cases. Full suite 147/147.

### 2026-05-22 — Auth system Phase 2 (email + password reset)

- [x] **Email service** — pluggable `services/email.service.ts` (`CONSOLE` dev default, `RESEND` for prod). Resend free tier 3,000/mo. New env: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `WEB_APP_URL` — added to `.env.example`, `.env.prod.example`, and a new "Email setup" section in `docs/deployment.md`.
- [x] **Forgot password** — `POST /auth/forgot-password` (by email) mints a single-use, 1-hour, SHA-256-hashed `PasswordResetToken` and emails the link. Always returns the same generic response so it can't enumerate accounts. `POST /auth/reset-password` consumes the token, sets the new password, and revokes all sessions. `GET /auth/reset-password/validate` lets the reset page pre-check a token.
- [x] **Tests** — 7 new cases (forgot/reset/validate, expiry, single-use, no-enumeration). Full suite 139/139.

### 2026-05-22 — Auth system Phase 1 (backend core)

- [x] **Multi-role accounts** — `User.roles UserRole[]` (migration `20260522_auth_system`). One phone can be CUSTOMER + STORE_OWNER + DRIVER at once. `User.role` stays the primary role; login picks an active role out of `roles` and the JWT (access + refresh) carries it. `grantRole()` helper in `utils/roles.ts`. `/stores/register` and `/drivers/register` now *add* the role instead of rejecting non-customers.
- [x] **Register-first model** — new `POST /auth/register` (name, phone, email, username, password, role) creates an unverified account and sends an OTP. `POST /auth/verify-otp` no longer auto-creates users — an unregistered number gets `404 "This mobile number is not registered"`. Verifying the OTP sets `phoneVerified` and completes registration.
- [x] **Username/password login** — `POST /auth/login` accepts a username *or* a 10-digit phone plus password. `POST /auth/change-password` (authenticated) clears the `mustChangePassword` flag and revokes other sessions. `passwordHash` is never returned in any auth response (`publicUser()` sanitiser).
- [x] **Schema** — added `User.email` (unique), `User.mustChangePassword`, `User.phoneVerified`, and the `PasswordResetToken` model (used in Phase 2). Existing users backfilled: `roles = [role]`, `phoneVerified = true`.
- [x] **Tests** — `auth.test.ts` rewritten (register / verify-otp / login / change-password); seed gives the 3 test accounts usernames + password `test1234`. Full suite 132/132.

### 2026-05-21 — Preferred stores

- [x] **Admin can flag a store as "preferred"** — `Store.isPreferred` boolean (migration `20260521_store_preferred`), toggled via `PUT /admin/stores/:id/preferred`. Mirrors the wholesaler-flag pattern. The matching engine gives preferred stores an additive score boost (`PREFERRED_STORE_BOOST = 0.15` in `matching.service.ts`) so they outrank equivalent stores — a boost, not an exclusive filter, so orders still match if no preferred store carries the items. Admin Stores page shows a "Preferred" badge + a Mark/Unset action.

### 2026-05-21 — Wholesaler restock orders (B2B)

Store owners can now restock from wholesalers/workshops. A "wholesaler" is a `Store` with `isWholesaler = true` (admin sets the flag). A retail store owner places a **RESTOCK** order; the **matching engine** picks the best in-range wholesaler (same engine as customer orders), then the accept → driver → delivery lifecycle moves the stock to the buyer's store.

- [x] **Schema** — `Store.isWholesaler`, `OrderType { CUSTOMER, RESTOCK }` enum, `Order.orderType` + `Order.buyerStoreId` (links a restock order to the retail store that placed it). Migration `20260521_wholesaler_restock`.
- [x] **Matching engine** — `matching.service.ts` is wholesaler-aware: RESTOCK orders match against wholesalers (`isWholesaler: true`), customer orders against retail stores. Same scoring/broadcast/driver pipeline.
- [x] **Backend** — `POST /orders/restock` (store owner submits catalog items; engine seeds + picks the best wholesaler; commission 0, delivery fee normal); `GET /orders/restock` (outgoing restock orders); `GET /wholesalers` + `GET /wholesalers/:id/items` (browse). Reject re-matches the next wholesaler.
- [x] **Admin** — `PUT /admin/stores/:id/wholesaler` toggle + a "Mark wholesaler" action and badge on the Stores page; `?type=` filter, RESTOCK badge, and buyer-store label on the Orders page.
- [x] **store-portal** — new **Restock** tab: browse the catalog → cart (`restock-cart.store.ts`) → place order (engine matches the wholesaler); plus a "My restock orders" history screen.
- [x] **Tests** — `backend/__tests__/wholesalers.test.ts`, 7 integration tests, all passing (run against the real test DB).

### 2026-05-21 — Deployment docs rewritten for the HyperVPS

- [x] **`docs/deployment.md` targets the HyperVPS plan** — rewrote the deploy guide around a 6 vCPU / 12 GB / 150 GB NVMe VPS. Added a "What gets deployed" six-container table, a "Production server" spec block, and an 8-step provider-neutral walkthrough (buy → SSH → DNS → clone + configure → SSL → start → first admin → smoke test) plus a Day-2 ops table.
- [x] **Fixed a Compose `--env-file` bug** — `docker-compose.prod.yml` interpolates `${REDIS_PASSWORD}` / `${POSTGRES_USER}` etc., which Compose reads only from a literal `.env`, not `.env.prod`. Without it Redis booted with no password and the Postgres healthcheck failed. Docs now use a `dc` alias with `--env-file .env.prod`; `scripts/deploy.sh` and `scripts/init-ssl.sh` updated to pass the flag too.
- [x] **Corrected the Environment var table** — it listed vars that don't exist in `.env.prod.example` (`CLOUDINARY_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_PUBLIC_URL`). Now matches the real file: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `REDIS_URL`, `DATABASE_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`.
- [x] **Plan + cost tables updated** — HyperVPS (~₹1,600–3,100/mo) now spans beta through launch with no mid-stage server upgrade. Removed the stale duplicate "TLS / First start / DNS / VPS bootstrap" sections that duplicated the new walkthrough.
- [x] **Reconciled the provider section** — replaced the HostLelo-specific product matrix with a provider-neutral "Choosing a VPS" section (required specs: root SSH/Docker, NVMe, India region) plus a short "If you host on HostLelo" note. Scale-phase cost table genericised off HostLelo SKUs.

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
