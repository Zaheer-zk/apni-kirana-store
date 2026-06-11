# Tasks Log

Running log of work in progress and completed. Newest commits at the top of each section.

## Done

### 2026-06-11 — Security review + production hardening

Full-project security pass. Findings + rationale in `docs/security-review.md`.

- [x] **P1 — rate limiting fixed behind nginx** — `express-rate-limit` keys by `req.ip`, but `trust proxy` was never set, so behind the production nginx proxy every request resolved to the proxy IP. The OTP limiter (10/15min) and global limiter (300/15min) were therefore ONE shared bucket across all clients — 10 OTP requests would lock out every user (DoS) and no attacker could be isolated. Set `app.set('trust proxy', 1)` in production only (`backend/src/index.ts`); `1` trusts exactly the single nginx hop, never `true` (which would trust a forged `X-Forwarded-For`). Dev/test has no proxy so it stays off.
- [x] **P2 — `ws` uninitialized-memory disclosure fixed** — moderate CVE (GHSA-58qx-3vcg-4xpx) reachable through socket.io (engine.io / socket.io-adapter), which is on the hot path (driver location, order events, chat). Resolved with a non-breaking `npm audit fix`.
- [x] **Reviewed clean** — no SQL injection (Prisma everywhere, zero raw queries); JWT secrets required with no fallback; admin routes `authorize('ADMIN')`; order/address IDOR checks present; passwordHash sanitised + bcrypt; OTP brute-force capped per-phone + per-IP and only logged under the dev CONSOLE provider; helmet on; CORS never `*` in prod; error handler doesn't leak stacks; no client-side secret exposure; XSS-safe `dangerouslySetInnerHTML` (static JSON-LD + SW script).
- [ ] **Follow-up (documented, not auto-applied)** — Next.js high-sev middleware/proxy-bypass advisory (GHSA-26hh-7cqf-hhc6) has no stable fix yet (only canary); `--force` would install a Next beta and risk breaking all 4 web apps. Exposure is low — the apps use no `middleware.ts` and authz is enforced server-side. Pin to stable 16.2.9 (already resolved) and bump when the stable patch ships. Transitive `qs` DoS resolves with the same upgrade.

### 2026-06-11 — Customer favorites / wishlist (web + mobile + backend)

- [x] **Schema** — new `Favorite` model keyed on `(userId, catalogItemId)` (migration `20260611_favorites`, idempotent). Keyed on CatalogItem (the canonical product), not StoreItem, so a favorite survives a store going out of stock — the list re-resolves the best nearby store at read time, matching the catalog-keyed cart model. Relations added to `User.favorites` + `CatalogItem.favorites`.
- [x] **Backend** — new `favorites.routes.ts` mounted at `/api/v1/favorites`: `GET /ids` (lightweight set of favorited catalogItemIds for rendering heart state), `GET /?lat&lng` (full list; each entry carries `bestOffer` = cheapest in-stock nearby store resolved server-side, zone-gated + wholesaler-excluded like catalog browse, plus `offerCount`), `POST /` (idempotent upsert, 404 on unknown product), `DELETE /:catalogItemId` (idempotent). All `authenticate`-gated.
- [x] **Shared** — `FavoriteEntry` type added to `@aks/shared`.
- [x] **Customer-web** — `lib/favorites.ts` (React Query `useFavoriteIds` shared id-set + optimistic `useToggleFavorite`), `FavoriteButton` heart component, hearts on `StoreItemCard` (compact + full) and the item detail page, new `/favorites` page (re-resolves offers against the user's location, add-to-cart through the same catalog-keyed path), and a Favorites entry in the `AppHeader` account menu.
- [x] **Customer-mobile** — `lib/favorites.ts` (mirror of web), `FavoriteHeart` component overlaid on `ItemCard` thumbnails, new `/account/favorites` screen, and a Favorites row in the profile menu.
- [x] **Tests** — `backend/__tests__/favorites.test.ts` (add/list/remove idempotency, cheapest-offer resolution, unauth 401, unknown-product 404). Ready to run under `docker compose up`; deferred live run because Docker wasn't available in this session. Type-checks clean across backend + customer-web + customer-mobile + shared.

### 2026-06-03 — Brand rename to Quick Easy Mart + SEO + (deferred GraphQL note)

- [x] **Brand rename — user-visible only**. Bulk sed across ~58 source files swapped `Apni Kirana Store` and `Apni Kirana` for `Quick Easy Mart` everywhere it appears in titles, manifests, page footers/headers, splash screens, auth shells, brand marks, email + SMS + notification + invoice templates, and docs. Also unified the short-form mobile names (`AKS Driver` → `Quick Easy Mart Driver`, `AKS Store` → `Quick Easy Mart Store`, etc.). Deliberately kept the technical identifiers stable: npm workspace packages (`@aks/*`), Expo slugs (`apni-kirana-customer` — tied to EAS project IDs), Android package names (`com.apnikirana.*` — Play Store entries), deep-link schemes (`apni-kirana://` — existing installs), invoice numbering prefix (`AKS/FY/000123`), and the folder layout. Renaming any of those would break builds, deploys, or existing user state.
- [x] **SEO — customer-web full setup**. `app/layout.tsx` rewritten with the Metadata API: title template, description, keywords (11 grocery-delivery long-tails), canonical + hreflang (en-IN, hi-IN), category, robots policy with Googlebot-specific hints (max-image-preview large, max-snippet -1), optional Google + Bing site-verification via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_BING_SITE_VERIFICATION` env vars, Open Graph block (type/locale/site/image with width+height+alt), Twitter `summary_large_image`. Inlined Organization + WebSite JSON-LD in `<head>` with sameAs placeholders, contactPoint (en+hi), and `SearchAction` `potentialAction` pointing at `/search?q={search_term_string}` so Google's sitelinks search box can hook in. New `app/robots.ts` (disallows every auth-gated route + `/api/`, points to sitemap) and `app/sitemap.ts` (static root + `/search` for now; per-item URLs deferred until the item page becomes a server component).
- [x] **SEO — auth-gated apps**. `store-web` + `driver-web` got `robots: {index:false, follow:false, nocache:true}` via the Metadata API. `admin` got an inline `<meta name="robots" content="noindex, nofollow, noarchive">` because it uses a `'use client'` root with custom SW-purge script.
- [x] **Shared types** — `StoreInventoryItem` gained optional `adminMargin` + `customerPrice` so store-web inventory's two-price display type-checks cleanly.
- [ ] **GraphQL (deferred)** — user asked to use GraphQL for new API work. Decided against ripping out REST: that's ~1–2 weeks of resolver rewrites + every client call site updated, plus migration churn. Recommended pattern when we pick it up: add a `/graphql` endpoint alongside REST for new client queries that benefit (esp. customer browse → store → items chain + admin order detail which currently makes 5 separate calls). Existing REST stays. Tracked as a P3 backlog item.

### 2026-06-02 (evening) — Zone enforcement everywhere + driver compensation + COD tracking + time audit

- [x] **Customer discovery zone filter** — 5 endpoints (`/stores/nearby`, `/items/search`, `/items/:id`, `/catalog/:id`, search hits via Fuse) now restrict to stores that share at least one active zone with the customer's location. Wholesalers excluded across all 5 (was inconsistent before). Falls back to haversine-only when no zones are configured (dev / early deploys).
- [x] **`services/zone.service.ts` extended** with `findZonesForPoint(lat, lng)` (all matching zones, vs the existing `findZoneForPoint` smallest-radius pick) and `filterStoresByCustomerZone(stores, lat, lng)` reused by every customer-side endpoint.
- [x] **Admin zone validation on rescue endpoints** — `GET /admin/orders/:id/eligible-stores` and `/eligible-drivers` now annotate each row with `inZone: boolean` and sort in-zone first. `PUT /admin/orders/:id/assign-store` and `/assign-driver` reject with 409 when assigning out-of-zone unless body has `{ force: true }`. Admin UI gets the flag for free and can warn before confirming.
- [x] **Driver compensation model** — schema gains `DriverCompensationType` enum (`PER_ORDER` | `SALARY`), `Driver.compensationType` default PER_ORDER, `Driver.monthlySalary` Float?. Migration `20260602_driver_comp_cod_tracking` (idempotent). New `PUT /admin/drivers/:id/compensation` to set type + monthly amount, `GET /admin/drivers/:id/salary-eligibility` returns activeDays / totalDeliveries / avgPerActiveDay / threshold {30 days, 3/day} / eligible boolean.
- [x] **COD reconciliation** — `Order.codCollected Boolean default false` + `codCollectedAt DateTime?` (with a partial index keyed on driverId+codCollected for outstanding-by-driver queries). New `PUT /admin/orders/:id/cod-collected` (admin marks COD settled per delivered order, reversible) and `GET /admin/drivers/:id/cod-outstanding` (list + total of delivered COD orders the driver hasn't handed cash for).
- [x] **Admin order-detail money-flow card** — now reads `codCollected`/`codCollectedAt`, hides 'To collect from driver' once admin settles, surfaces a 'COD settled' positive row with the timestamp, and adds a footer 'Mark COD collected' / 'Undo COD settled' action that mutates the new endpoint.
- [x] **Time display audit** — six fallback `toLocaleDateString()` calls in the notification inboxes (3 web + 3 mobile) were using the device default. Pinned all to `'en-IN'` so DD/MM/YYYY is consistent with the other 69 toLocale calls in the apps.

### 2026-06-02 — Two-tier pricing + per-zone fees + per-order money flow

Net-new pricing model + admin commission controls + settlement visibility, shipped as a single coherent batch end-to-end (backend schema → APIs → customer-web + customer-mobile → store-web + store-portal mobile → admin).

- [x] **Schema** — `StoreItem.adminMargin Float @default(0)` added (migration `20260602_storeitem_admin_margin`, idempotent). `Zone.baseDeliveryFee / perKmFee / commissionRate` columns already existed; this batch wires them into order math.
- [x] **Two-tier pricing model**:
  - `StoreItem.price` (existing) = store owner's payout per unit.
  - `StoreItem.adminMargin` (new) = admin's commission per unit, set after offline negotiation.
  - Customer pays `price + adminMargin`. Backend rolls it up as `customerPrice` on every storeItem response so apps don't recompute.
  - Order math: subtotal = `(price + adminMargin) × qty`, commission = `adminMargin × qty`. Falls back to global `commissionPercent` when all items have `adminMargin = 0` so legacy items keep working.
  - `OrderItem.price` stores the customer-facing unit price (what the customer actually paid) so invoices + refunds multiply the right amount.
- [x] **Zone-scoped fees** — new `services/zone.service.ts` with 60s in-memory cache + smallest-radius-wins point-in-zone resolution. `POST /orders` and `POST /orders/restock` now use `zone.baseDeliveryFee / perKmFee / commissionRate` when the store falls inside an active zone, else fall back to `PlatformSetting`. Admin zone CRUD invalidates the new cache alongside the existing liveops cache.
- [x] **Admin endpoint** — `PUT /api/v1/admin/store-items/:id` to edit per-StoreItem `adminMargin`/`price`/`stockQty`/`isAvailable`. `POST /admin/stores/:id/items/bulk` also accepts an optional `adminMargin` so admin can set the margin up-front when pre-stocking.
- [x] **Customer surfaces** (web + mobile) — `ItemCard` / item detail / catalog store-picker / store-item card all display `customerPrice` (the marked-up number) instead of raw `price`. Cart additions persist the customer-facing amount so client-side subtotals match what the backend computes.
- [x] **Store surfaces** (web + mobile) — inventory rows now read "Your payout: ₹X" + a sub-line "Customer pays ₹Y (+ ₹Z platform)". Empty-margin state shows "Admin hasn't set a platform margin yet".
- [x] **Admin** — store detail page replaces the static price column with an inline `adminMargin` editor (click-to-edit, Enter/blur saves, Escape cancels, green tick on success). Each row also surfaces "Store gets ₹X · Customer pays ₹Y".
- [x] **Per-order money flow card** — new section on admin order detail (between bill table and OTP) showing: Customer paid, Driver collected / Admin received, Owed to store, Owed to driver, Admin retains, and To-collect-from-driver (COD only after delivery). Covers both COD ("driver has the cash, admin reconciles later") and online-paid ("admin holds funds, owes store + driver") flows.

### 2026-06-01 (evening) — Full web↔mobile parity ship (13 new surfaces)

Closed every web↔mobile gap the parity audit flagged. After this batch the customer / store / driver surfaces all expose the same features whether opened on web or mobile.

- [x] **Driver-web** — gained 5 surfaces matching the mobile app:
  - `/notifications` — inbox with mark-read + mark-all-read, polls every 30s. AppHeader bell badge (was a no-op placeholder before).
  - `/help` — same 8 FAQ entries as the mobile app + call / WhatsApp / email contact rows + CTA to /support.
  - `/support` — per-user thread with admin. Uses /api/v1/support/me/messages + support:join/leave/message socket events so the conversation syncs across surfaces.
  - `/ratings` — aggregate stars + 5-bar distribution + recent reviews. Same derivation (filter /orders by rating.driverRating) as mobile.
  - `/chat/[orderId]` — per-order chat with customer or store. Same /api/v1/chats endpoints + chat:join/leave/message socket events. Active delivery page gained a "Chat with customer/store" CTA between the location cards and items.
  - Dropdown menu adds My ratings + Help & FAQs so the new screens are discoverable.

- [x] **Store-web** — gained 5 surfaces matching the mobile app:
  - `/notifications` — same shape as driver-web. AppShell bell now links to it with an unread badge (was placeholder).
  - `/orders/[id]/chat` — per-order chat with customer (or driver after pickup). Order detail page gained a "Chat with customer/driver" CTA gated on active statuses.
  - `/restock` — browse master catalog + add to cart. Zustand store persisted to localStorage (`aks-store-restock-cart`).
  - `/restock/cart` — quantity stepper + payment method picker (COD / Online) + Place restock order via /api/v1/orders/restock.
  - `/restock/orders` — restock history with status pills (Awaiting wholesaler / Accepted / On the way / Delivered / Cancelled).
  - Sidebar gained a "Restock" nav entry between Inventory and Earnings; en + hi i18n keys added.

- [x] **Customer-mobile** — gained 3 surfaces matching customer-web:
  - `/account/wallet` — balance card + paginated transaction list. Same /api/v1/users/me/wallet endpoint as web. Refunds, promo credits, goodwill, order payments, and adjustments each get their own icon + tint. Reachable from the profile tab.
  - `/reset-password` — deep-link handler for password-reset emails. Validates token via /auth/reset-password/validate then collects + confirms a new password. 4-stage UX (checking → form → done | invalid) matching the web. Triggered by the existing `apni-kirana://reset-password?token=…` scheme + universal links.
  - Delivered order detail gained a "Download GST invoice" button. Fetches as arraybuffer, base64-encodes, writes to a temp PDF via expo-file-system/legacy, hands it to expo-sharing's OS share sheet (save / print / email). Added expo-file-system + expo-sharing deps.

### 2026-06-01 (afternoon) — 3-app parity audit + P0 bugs + P1 UI alignment

Ran three parallel parity audits (one per app pair: customer / store / driver) comparing web ↔ mobile feature-by-feature, route-by-route, with specific file:line citations.

- [x] **P0.1 driver-mobile COD bug** — dashboard compared `paymentMethod === 'COD'` but backend enum is `'CASH_ON_DELIVERY'`. Drivers were seeing "Already paid" on cash orders and would have skipped collection. Real money bug.
- [x] **P0.2 customer-mobile OrderStatusBadge** — Record<OrderStatus,…> map was missing COOKING entry; restaurant orders in cooking state would render an undefined config (crash). Added amber-tinted COOKING config.
- [x] **P0.3 customer-mobile ItemCategory.ELECTRONICS** — 6 non-exhaustive maps (home, search, catalog browse, catalog detail, item detail, ItemCard, CategoryGrid). Electronics items rendered with undefined emoji/icon. Added 🔌 emoji + flash-outline icon to every map. Brought customer-mobile tsc errors down 14 → 3 (rest are pre-existing).
- [x] **P0.4 store-web recipient block** — added in the morning to mobile but missed on web. Store owners can now see "Order for someone else" recipient name + phone on the order detail's Delivery info card.
- [x] **P1.1+P1.2 brand unification** — audit confirmed store-portal mobile was BLUE (#2563EB) and driver mobile was RED (#DC2626) while web for all surfaces is GREEN (#16A34A). Aligned both mobile palettes to green across `constants/theme.ts`, `app.json` primaryColor, Android notification channel `lightColor`, foreground service `notificationColor`, and inline hex in register / not-found / InventoryItem. Driver mobile keeps green as accent too (its "online" indicator and earnings text are semantic green — amber would read wrong). Status badges in restock/orders and the StoreItem "info" palette stay blue (intentional info semantics, not brand).
- [x] **P1.3 customer-mobile CoverageBanner** — new component at `apps/customer/components/CoverageBanner.tsx` hits `/api/v1/zones/coverage` with the default-address coordinates. In-zone: quiet green chip; out-of-zone: amber card with nearest zone + distance + "Manage addresses" CTA. Mirrors `apps/customer-web/app/page.tsx` CoverageBanner. Out-of-zone customers were previously seeing silent "no stores nearby" with no explanation.
- [x] **P1.4 customer-mobile 3-state milestone timeline** — replaces old completed/hollow-ring/gray scheme with the web's completed (green check) / amber-pulse-inProgress / gray-pending semantics. The current step now reads as DONE (matches user mental model — "my order is accepted" is a finished milestone), and the next step shows an amber-tinted Animated.View pulse for what's actively waiting.
- [x] **P1.5 store-mobile payout breakdown + driver card** — order detail now shows Items subtotal − Platform commission = Your payout with a note that the delivery fee goes to the driver. Plus a Driver card (name + vehicle + Call button) once a driver is assigned. Mirrors `apps/store-web/app/orders/[id]/page.tsx:341-401`. Mobile keeps it lightweight (no live map — customer-mobile already has one for the recipient).
- [x] **Backlog noted (P2/P3)** — open in priority order for next push: structured reject reasons on store-mobile (5 categories vs free text), driver-web `OnlineToggle` hero variant needs to share `watchPosition` with `HeaderOnlineToggle`, customer-mobile wallet screen + reset-password deep link, driver-web missing notifications/help/support/ratings/chat-with-customer screens, store-web missing chat-per-order + notifications-log + restock-buying.

### 2026-06-01 — Catalog item requests + Expo apps parity + deploy hardening

- [x] **Catalog item requests (B2A)** — store owners can ask admin to add new items to the master catalog. Schema: new `CatalogItemRequest` model + `CatalogRequestStatus` enum (`PENDING`/`APPROVED`/`REJECTED`); migration `20260601_catalog_item_request` (idempotent). Backend: `POST /api/v1/catalog/requests`, `GET /api/v1/catalog/requests/mine`, `GET /api/v1/admin/catalog-requests?status=`, `PUT /api/v1/admin/catalog-requests/:id`. Approving a request auto-creates the CatalogItem (reusing if name already exists) and links it into the requester's StoreItem inventory at the suggested price (or zero) — owner just sets stock. Rejections carry an optional admin note shown back to the owner.
- [x] **Web UIs** — store-web `/help` (FAQ section + recent-requests list) and `/inventory/request-item` form. Admin `/catalog-requests` triage queue with approve/reject + reason note. New `Help & FAQs` nav entry in store-web sidebar; new `Catalog requests` entry in admin sidebar.
- [x] **Expo mobile parity** — brought all three React Native apps up to par with this session's web features:
  - **driver mobile**: `/profile/zones` multi-select with empty-state warning; foreground location ping while ONLINE (was previously silent until an order was accepted — drivers were invisible to the matching engine before pickup); Android vibration pulse on the incoming-offer modal; dashboard idle copy now lists the 3 prerequisites (online + location permission + at least one zone).
  - **store-portal mobile**: COOKING workflow ("Start cooking" → "Mark food ready" for restaurants); `packedAt`-aware Mark-Ready button hides after first success and is replaced with a "Packed & ready" card (fixes the multi-click bug the web had); recipient block ("order for someone else") in the delivery-info section; new `/inventory/request-item` form + secondary FAB.
  - **customer mobile**: "Order for someone else?" toggle + name/10-digit-phone validation at checkout; step indicator inserts a "Cooking" milestone between Accepted and Assigned for `store.category === 'RESTAURANT'` only; new status headline "Your food is being prepared".
- [x] **Shared enum** — `OrderStatus.COOKING` added to `@aks/shared`; admin's `Record<OrderStatus, string>` STATUS_LABELS map gains the label.
- [x] **Deployment** — successfully shipped to `quickeasymart.com` (admin/store/driver/customer/api). Live: catalog-request flow works end-to-end against prod.
- [x] **Docs** — `docs/deployment.md` gains: (a) `.env → .env.prod` symlink as an alternative to the `dc` alias, (b) generalised one-line sed for the nginx domain substitution covering all 6 confs (not just api+admin), (c) a "commit nginx confs to a server-local branch" step so they survive future `git pull`s (uncommitted local edits + `git stash pop` was the root cause of today's nginx crash loop).

### 2026-05-24 — Auth overhaul (backend) — per-role email/username + unified login + approval gate

- [x] **Schema** — `User.email` and `User.username` are now unique PER ROLE (`@@unique([email, role])`, `@@unique([username, role])`) instead of globally. One human can hold separate CUSTOMER + STORE_OWNER + DRIVER accounts with the same email/username — each is its own row. Migration `20260524_user_email_username` drops the old global indexes, adds partial composite uniques (`WHERE X IS NOT NULL`), and relaxes `User.phone` to nullable (data-preserving — no rows touched). Verified via `prisma migrate deploy` on a fresh DB.
- [x] **`POST /api/v1/auth/login-password`** — new unified endpoint. Body: `{ identifier, password, role }`. Identifier matches `username` OR `email` on the `(X, role)` tuple. Works for every role including ADMIN; `/admin-login` stays for back-compat. Returns the same `{ accessToken, refreshToken, user }` envelope as existing auth endpoints, plus `pendingApproval: true` + `reason: 'STORE_PENDING' | 'DRIVER_PENDING'` when the role profile is waiting on admin approval.
- [x] **`POST /api/v1/auth/register`** — `email`, `username`, `password` are now OPTIONAL. Phone-only signup (then OTP login) is the minimum viable flow; web apps can keep collecting email + password and get full username/password login on day 1.
- [x] **Approval gate middleware** — new `requireApproved` in `auth.middleware.ts`. 403s when the caller's STORE is `PENDING_APPROVAL`/`SUSPENDED`, or DRIVER is `PENDING_APPROVAL`/`SUSPENDED`. Wired into `items.*` write routes, `orders POST /restock` + store-side accept/reject, and driver order accept/reject/pickup/deliver. Reads (`/stores/me`, `/auth/me`) stay open so a pending account can still see its profile.
- [x] **Admin notification on registration** — `POST /stores/register` + `POST /drivers/register` now fan out an email + web push to every active admin ("New store/driver awaiting approval — <name>" → `${WEB_APP_URL}/stores/<id>`). Best-effort: a Resend / VAPID outage never fails registration.
- [x] **Applicant notification on approval** — `PUT /admin/stores/:id/approve` + `PUT /admin/drivers/:id/approve` email the applicant ("Your store/driver account is approved") and fire the in-app `STORE_APPROVED` / `DRIVER_APPROVED` notification template.
- [x] **Frontend handoff notes** — login responses now include `pendingApproval` boolean + `reason` enum. Web apps' `/login` should route pending stores/drivers to a "your account is awaiting approval" screen instead of the normal dashboard. The token still works for `/auth/me` + the role's profile read endpoint, so the pending screen can show "as <Name>" personalisation.
- [x] **Tests** — 183/183 (53 in auth.test.ts: +13 new). New coverage: `/login-password` by email + username, wrong password, role-not-granted, missing-role, no-password-set hint, multi-role email coexistence, pendingApproval for store + driver, ACTIVE store omits the flag, phone-only registration, same email across two roles, same email blocked within one role.

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
