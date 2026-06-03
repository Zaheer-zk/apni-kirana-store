# Driver web app (`apps/driver-web`)

Next.js 16 / React 19 partner web surface for **drivers** at
`https://driver.quickeasymart.com`. Same stack and structural patterns as
`apps/customer-web` (Slice 1, commit `881c729`).

## What's in Slice 1

| Surface | Route | Notes |
|---|---|---|
| Login | `/login` | Username/phone + password OR phone + OTP. `role=DRIVER` baked into the request. |
| Register | `/register` | 2-step: account form → OTP → vehicle/licence form → submitted-screen. Creates the `Driver` row via `POST /api/v1/drivers/register`. |
| Forgot password | `/forgot-password` | Sends a reset link via `POST /api/v1/auth/forgot-password`. |
| Reset password | `/reset-password?token=` | Validates the token, then `POST /api/v1/auth/reset-password`. |
| Change password | `/change-password?next=` | Force-change after admin issues a temp password. |
| Pending approval | `/pending` | Post-registration timeline screen; polls `GET /drivers/stats/today` every 30 s and auto-advances when admin approves. |
| Dashboard | `/` | Greeting, online toggle, today stats (deliveries / earnings / hours), active-delivery card with pickup + drop addresses + "Open in Maps", recent earnings list. |
| Deliveries | `/deliveries` | History list (date, status, pickup→drop, earnings). |
| Profile | `/profile` | Hero card (avatar / rating / lifetime stats), vehicle info (read-only), account info, edit display name dialog, change password, sign out. |

## What's **not** in Slice 1

- **No background GPS tracking.** Browsers cannot reliably ping
  `geolocation.watchPosition` for the duration of a delivery shift —
  background tabs are throttled, screen-locked phones suspend JS, and
  browser permission UX is hostile. The Expo `apps/driver` app handles
  live-location updates through `expo-task-manager`; the web app is for
  profile / earnings / approvals / online-toggle only.
- **No order-accept / OTP-confirm / pickup actions.** Mid-shift order
  actions stay in the mobile app where push notifications work properly.
  The web dashboard shows the active delivery for situational awareness
  only.

This split is intentional. The web app is a companion surface — a driver
can sign up, check earnings, and toggle their availability from any
desktop or kiosk browser. The mobile app remains the source of truth for
in-shift workflow.

## Stack

Mirrors `apps/customer-web` exactly:

- **Next.js 16.2** App Router, React 19, Tailwind 3 (via `@aks/ui`'s
  preset)
- **Shared types** from `@aks/shared` (no local duplicates)
- **Shared components** from `@aks/ui` (Button, Input, Dialog, Sheet,
  Card, Tabs, Badge, DropdownMenu, Skeleton, Select, Avatar, InputOTP,
  Sonner toaster)
- **State / data** via `@tanstack/react-query` + `axios` (with the same
  `{success, data, error}` envelope-unwrap interceptor as customer-web)
- **Forms** via `react-hook-form` + `zod`
- **Auth** in `localStorage` under `aks_driver_*` keys (separate
  namespace from customer-web's `aks_customer_*` so the three web apps
  coexist cleanly on a shared device)

## PWA (installable)

The app is a Progressive Web App and meets the Lighthouse
"installable" criteria:

- `app/manifest.ts` exposes `/manifest.webmanifest` with
  `display: 'standalone'`, `start_url: '/'`, theme + background colours,
  and 192 / 512 / 512-maskable icons.
- `public/sw.js` is a small service worker registered from
  `components/Providers.tsx` on idle. It pre-caches the offline shell +
  icons; on navigation it falls back to `/offline.html` when offline.
- `public/icons/*.png` are placeholder branded icons (green tile +
  "Quick Easy Mart"). Replace with the real logo before public launch — keep the
  same filenames so the manifest doesn't need touching.

### Install on Android

1. Open `https://driver.quickeasymart.com` in Chrome.
2. Tap the ⋮ menu → **Install app** (or "Add to Home screen").
3. The app launches in its own standalone window with no browser chrome.

### Install on iOS

iOS only installs via Safari's Share sheet → **Add to Home Screen**.
The `apple-touch-icon` and `apple-mobile-web-app-*` meta tags are
already wired in `app/layout.tsx`.

### Verifying

```bash
# Lighthouse PWA audit
npx lighthouse https://driver.quickeasymart.com \
  --only-categories=pwa --view
```

Look for: installable manifest ✓, registered service worker ✓, theme
colour ✓, viewport meta ✓, HTTPS ✓.

## Local development

```bash
# From the repo root once the workspace is installed
cd apps/driver-web
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
# Open http://localhost:3000
```

Type-check the app on its own:

```bash
cd apps/driver-web
npx tsc --noEmit
```

## Deploy (production)

```bash
# On the VPS
docker compose -f docker-compose.prod.yml build driver-web
docker compose -f docker-compose.prod.yml up -d driver-web nginx
```

DNS: point `driver.quickeasymart.com` → the VPS public IP. Re-run
`scripts/init-ssl.sh api.quickeasymart.com admin.quickeasymart.com
quickeasymart.com store.quickeasymart.com driver.quickeasymart.com
you@quickeasymart.com` to add the subdomain to the combined Let's
Encrypt certificate (the `nginx/conf.d/driver.conf` vhost already
references `live/api.quickeasymart.com/`).

### New env vars

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL_DRIVER` | API base URL inlined into the driver web bundle at build time. Usually `https://api.quickeasymart.com`. |

`CORS_ORIGIN` must include `https://driver.quickeasymart.com` — the
`.env.prod.example` already lists every web subdomain.

## Where the screens come from

The web flow ports the Expo `apps/driver` screens 1:1:

| Web | Expo source of truth |
|---|---|
| `app/login/page.tsx` | `apps/driver/app/(auth)/login.tsx` |
| `app/register/page.tsx` | `apps/driver/app/(auth)/register.tsx` |
| `app/forgot-password/page.tsx` | `apps/driver/app/(auth)/forgot-password.tsx` |
| `app/change-password/page.tsx` | `apps/driver/app/(auth)/change-password.tsx` |
| `app/pending/page.tsx` | `apps/driver/app/(auth)/pending.tsx` |
| `app/page.tsx` (dashboard) | `apps/driver/app/(tabs)/dashboard.tsx` |
| `app/deliveries/page.tsx` | `apps/driver/app/(tabs)/deliveries.tsx` |
| `app/profile/page.tsx` | `apps/driver/app/(tabs)/profile.tsx` |

If a copy change ships on either surface, mirror it to the other to keep
the product feel consistent.
