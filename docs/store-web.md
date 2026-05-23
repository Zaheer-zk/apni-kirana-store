# Store web — store.quickeasymart.com

Operator dashboard for store owners. Lives at `apps/store-web/` and ships
the web version of the existing Expo `apps/store-portal/` flows. Built on
the same `@aks/ui` + `@aks/shared` stack as `apps/customer-web/` — copy
that app's patterns when extending.

> If you change the API contract, mirror the change in **both**
> `apps/store-portal/` and `apps/store-web/`. They are intentionally the
> same product on different surfaces.

## Slice 1 scope

What ships today:

| Area | Routes | Notes |
|---|---|---|
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password?token=`, `/change-password?next=` | Login supports username/phone + password OR phone + OTP. Registration is a 3-step wizard (account → OTP → store details with map picker). |
| Dashboard | `/` | Live tiles: pending / today's orders / completed / revenue. Active orders list. Quick links to inventory + profile. |
| Orders | `/orders`, `/orders/[id]` | Tabs: Pending / Accepted / Picked up / Completed. Detail page: items, delivery info (privacy-redacted), timeline, accept/reject/mark-ready actions. |
| Inventory | `/inventory`, `/inventory/browse-catalog` | List with availability toggle + inline edit (price / stock) via Dialog. Browse Catalog searches the master catalog and opens an "Add to my store" Dialog. |
| Profile | `/profile`, `/profile/edit` | Store details: name, description, category, location (map picker), address, operating hours. |
| PWA | `/manifest.webmanifest`, `/sw.js` | Installable on Android Chrome and iOS Safari. Hand-written service worker caches the app shell + static assets. |

The Open/Closed pill in the top bar drives `PUT /api/v1/stores/:id/toggle-open`
— a single tap from any authenticated route.

## Backend endpoints added for store-web

These were missing from the API surface even though `apps/store-portal/`
referenced them; they ship in this slice so both store surfaces (Expo +
web) have a working dashboard:

- `GET /api/v1/stores/me/items` — inventory list for the signed-in store
  owner. Returns the same flat shape as `GET /api/v1/stores/:id/items`
  (the existing endpoint), but resolves `storeId` from the JWT so web
  clients don't need to fetch `/stores/me` first.
- `GET /api/v1/stores/stats/today` — today's snapshot
  (`ordersReceived` / `ordersCompleted` / `revenue` / `pending`).
  Returned shape matches the new `StoreDashboardStats` type in
  `@aks/shared`.

Existing endpoints reused unchanged:
`POST /auth/register`, `POST /auth/verify-otp`, `POST /auth/login`,
`POST /auth/forgot-password`, `POST /auth/reset-password`,
`POST /auth/change-password`, `GET /stores/me`, `PUT /stores/:id`,
`PUT /stores/:id/toggle-open`, `POST /stores/register`,
`GET /stores/orders`, `GET /stores/orders/active`, `GET /orders/:id`,
`PUT /orders/:id/accept`, `PUT /orders/:id/reject`,
`PUT /orders/:id/ready`, `POST /items`, `PUT /items/:id`,
`DELETE /items/:id`, `PUT /items/:id/toggle-availability`,
`GET /catalog`, `GET /catalog/search/q`.

## Shared library additions

- **`@aks/shared`** now exports `StoreOrder`, `StoreOrderLineItem`,
  `StoreDashboardStats`, `OrderDetail`, `OrderStatusEvent`,
  `StoreInventoryItem`, `CatalogItemRow`. The Expo store-portal already
  imports `StoreOrder` / `OrderDetail` etc from `@aks/shared` — these
  declarations make those imports concrete so the types are real
  (previously they silently resolved to `any`).
- **`@aks/ui`** now exports a `<LocationMap />` component
  (`packages/ui/src/components/location-map.tsx`). It always asks the
  browser for `navigator.geolocation` **before** mounting the tile layer
  and only falls back to the saved coordinates (or Delhi centre) if GPS
  is denied or unavailable. customer-web / store-web / driver-web all
  get this contract for free — see also the
  `apps/store-web/components/StoreLocationPicker.tsx` wrapper that
  `next/dynamic({ ssr: false })`-imports the component on the client.

## Local development

```bash
# Install deps (workspaces, top-level)
npm install --legacy-peer-deps

# Run the backend + db + redis
docker compose up -d backend postgres redis

# Run store-web on the host (Next 16 dev server)
cd apps/store-web
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
# → open http://localhost:3000
```

The backend container exposes port **3001** on the host
(container 3000 → host 3001). When running store-web from the host, point
`NEXT_PUBLIC_API_URL` at `http://localhost:3001`.

Typecheck:

```bash
cd apps/store-web && npx tsc --noEmit
```

## Production deploy

Mirrors the customer-web flow exactly:

1. Add the new build arg to `.env.prod`:
   ```env
   NEXT_PUBLIC_API_URL_STORE=https://api.quickeasymart.com
   ```
2. Make sure the SSL cert covers `store.quickeasymart.com`. When you run
   `init-ssl.sh`, pass the additional domain so it lands in the SAN list:
   ```bash
   bash scripts/init-ssl.sh \
     api.quickeasymart.com \
     admin.quickeasymart.com \
     quickeasymart.com \
     store.quickeasymart.com \
     driver.quickeasymart.com \
     you@quickeasymart.com
   ```
   (If the certificate already exists, run `certbot --expand` or reissue
   to add the new domain.)
3. Build and start the new service:
   ```bash
   docker compose -f docker-compose.prod.yml build store-web
   docker compose -f docker-compose.prod.yml up -d store-web nginx
   ```
4. Verify:
   ```bash
   curl -I https://store.quickeasymart.com/
   # → 200, with Content-Type: text/html
   ```

## PWA install instructions (for end users)

The dashboard is installable as a Progressive Web App so store owners can
launch it from their home screen and get the chrome-less full-screen
experience. The first visit registers the service worker; from then on
the install banner becomes available.

**Android (Chrome)**
1. Visit `https://store.quickeasymart.com` and sign in.
2. Tap the three-dot menu → **Add to Home screen** (or **Install app**).
3. Tap **Install**. The app icon appears on your home screen.

**iOS (Safari)**
1. Visit `https://store.quickeasymart.com`.
2. Tap the **Share** button → **Add to Home Screen**.
3. Confirm. The app icon appears on your home screen.

iOS doesn't show the customisable install prompt that Chrome does — you
have to use the Share menu. iOS PWA support is also missing push
notifications and background sync, so real-time order alerts still
require the Expo store-portal app.

## What we deliberately didn't ship

- **Realtime push** (web push / VAPID). Tracked separately; for now the
  Expo `apps/store-portal/` is still the canonical channel for real-time
  order alerts.
- **Chat with customer/driver**. The Expo app has it; reusing the
  socket client in a web app is a Slice 2 item.
- **Earnings / restock tabs**. Out of Slice 1 scope.
- **Per-user notification preferences**. Reuse whatever the Expo app
  ships when notifications-on-web lands.
- **Server-side auth (httpOnly cookies + middleware)**. Tokens live in
  `localStorage` under `aks_store_*` keys and the route gate is the
  client-side `<AuthGuard>` component. If we move to cookies we can
  promote that to `middleware.ts` and skip the loading flash.

## House conventions enforced here

- Brand primary green is `#16A34A` and only ever reached through the
  Tailwind `primary` / `primary-*` shades exported by the `@aks/ui`
  preset. **No hardcoded hex values in components.**
- Every interactive control comes from `@aks/ui` (Button, Input, Dialog,
  Sheet, Card, Tabs, Badge, DropdownMenu, Sonner toast, Select,
  Skeleton, Avatar). Drop-in additions belong in `@aks/ui` first so
  driver-web and customer-web inherit them for free.
- Every API type comes from `@aks/shared`. If a type doesn't exist yet,
  add it to `shared/src/types.ts` instead of redeclaring locally.
- Responsive breakpoints: layouts verified at 360 px / 768 px / 1024 px
  / 1440 px. Mobile-first; tables collapse to cards on small screens
  via Tailwind's `sm:` / `md:` utilities.
