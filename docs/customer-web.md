# Customer storefront (`apps/customer-web`)

The public-facing storefront for Quick Easy Mart, served at **`https://quickeasymart.com`**. A Next.js 16 app router project consuming the shared `@aks/ui` library, the same backend as the mobile and admin apps, and the same brand tokens as the React Native customer app.

> The Expo customer app (`apps/customer/`) is not going away — this is a parallel web channel for users who'd rather order from a desktop / laptop / WhatsApp link.

## Stack

- Next.js 16 (App Router)
- React 19
- Tailwind 3 + shadcn/ui (via `@aks/ui`)
- React Query (server state) + Zustand (cart, persisted to localStorage)
- React Hook Form + zod (auth forms)
- Axios for HTTP
- Sonner for toasts
- All MIT / open source

## Slice 1 — what shipped

| Area | Routes / files | Notes |
|---|---|---|
| **Auth** | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/change-password` | Password + OTP login. Six-box OTP via the shared `<InputOTP>`. Forms use React Hook Form + zod. |
| **Home** | `/` | Brand hero, search bar, trending search chips, "Popular near you" carousel powered by the new ranking endpoint, three-card promise grid. |
| **Search** | `/search?q=&sort=` | Item-first results. Each row is one StoreItem at one nearby store. Sort: Recommended / Cheapest / Nearest. URL stays in sync with query + sort. |
| **Item detail** | `/item/[storeItemId]` | Hero image, store card, qty stepper, single-store Add-to-cart. |
| **Cart** | `/cart` | Line items, qty +/-, totals, "Proceed to checkout" stub for Slice 2. Single-store rule enforced via `lib/cart.ts` — adding from another store opens `<SwitchStoreDialog>`. |

### Where the data comes from

- `GET /api/v1/items/search` (location-aware ranking) — new endpoint, see `docs/ranking-algorithm.md`.
- `GET /api/v1/items/:id` (item detail) — new endpoint.
- `POST /api/v1/auth/{register, send-otp, verify-otp, login, forgot-password, reset-password, change-password}` — already existed.

### Backend changes shipped with this slice

- `backend/src/services/ranking.service.ts` — shared scoring formula (see `docs/ranking-algorithm.md`).
- `backend/src/routes/items.routes.ts` — `GET /search` now supports `lat/lng/radius/sort` (legacy `q` + `category` mode preserved for the mobile app); `GET /:id` added.
- `backend/__tests__/items-search.test.ts` — integration tests for both new behaviours.

## Local development

The customer-web app reuses the monorepo dev stack — Postgres, Redis, backend on `:3001` (host), admin on `:3002` (host).

```bash
# Install once at the repo root
npm install --legacy-peer-deps

# Bring up Postgres + Redis + backend + admin
docker compose up -d

# Run the customer storefront on the host (no Docker needed for dev)
cd apps/customer-web
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
# → http://localhost:3000
```

Type-check + lint:

```bash
cd apps/customer-web
npx tsc --noEmit
npm run lint
```

## Deploy (production)

The customer-web service is wired into `docker-compose.prod.yml` next to the admin service.

```bash
# On the VPS, after pulling latest:
docker compose -f docker-compose.prod.yml build customer-web
docker compose -f docker-compose.prod.yml up -d customer-web nginx

# Re-issue the SAN cert to include the new hostname (one-time per new domain):
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name api.quickeasymart.com \
  -d api.quickeasymart.com \
  -d admin.quickeasymart.com \
  -d quickeasymart.com \
  -d www.quickeasymart.com \
  -d store.quickeasymart.com \
  -d driver.quickeasymart.com \
  --expand
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

DNS records needed before that:

- `quickeasymart.com.        A    <vps-ip>`
- `www.quickeasymart.com.    A    <vps-ip>`

The full per-app deploy recipe (DNS, cert expansion, build, up) lives in `docs/web-apps.md`.

### Required env vars

| Var | Where | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL_CUSTOMER` | `.env.prod` (compose passes it as a **build arg**) | `https://api.quickeasymart.com` |

Storage: `localStorage` keys are namespaced (`aks_customer_token`, `aks_customer_refresh`, `aks_customer_user`, `aks-customer-cart`) so the three web apps can coexist on the same browser without trampling each other's sessions.

## What's coming in Slices 2 & 3

**Slice 2 — checkout & orders**

- `/checkout` — multi-step: address picker on Leaflet (read-only on small viewports), payment method (COD + Razorpay/Stripe), promo entry.
- `POST /api/v1/orders` integration — the same endpoint the Expo app uses.
- `/orders` and `/orders/[id]` — order list, live status via socket.io, "Track on map" (Leaflet) for IN_TRANSIT.
- Auth-gate the checkout flow with a server-side redirect on `/checkout`.

**Slice 3 — account & polish**

- `/account/addresses` with a `<MapPicker>` ported from admin's `LocationMap`.
- `/account` profile, change-password, notification preferences.
- Reorder past order, save-for-later, push-notification opt-in via the web Push API.
- Sitemap / `next-sitemap`, OpenGraph + structured data on product pages.
