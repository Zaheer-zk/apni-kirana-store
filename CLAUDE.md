# CLAUDE.md — Apni Kirana Store working notes

This file is for Claude. It captures everything that's NOT obvious from
reading the code, plus the gotchas that have already bitten us.

## What is this repo

Hyperlocal grocery delivery monorepo with **5 surfaces** sharing a single
Express + Prisma backend:

- `backend/` — Node 20 + Express + Prisma + PostgreSQL + Redis + BullMQ + Socket.io
- `apps/admin/` — Next.js 16.2 + React 19 + Tailwind 3 dashboard (Docker)
- `apps/customer/` — Expo SDK 54 React Native (runs on host, scanned via Expo Go)
- `apps/store-portal/` — Expo SDK 54 React Native
- `apps/driver/` — Expo SDK 54 React Native (uses expo-task-manager for background GPS)
- `shared/` — TypeScript types + enums shared between backend and the apps

Provider chosen for production: **HostLelo** (`hostlelo.com`) — user owns it.
Recommended plan for MVP: Multi-Region Cloud VPS, 4 vCPU / 4 GB / 100 GB NVMe,
Mumbai region.

## Where to look first when something breaks

| Problem area | Open this |
|---|---|
| Backend behavior / business logic | `backend/src/routes/*.routes.ts`, `backend/src/services/*.service.ts` |
| Schema | `backend/prisma/schema.prisma` |
| Matching engine (which store gets the order) | `backend/src/services/matching.service.ts` |
| Driver assignment | `backend/src/services/driver.service.ts` |
| Notification dispatch | `backend/src/services/notification.service.ts` |
| Real-time events | `backend/src/socket/index.ts` + `backend/src/services/order-events.service.ts` |
| Admin UI | `apps/admin/app/(dashboard)/...` |
| Customer/store/driver screens | `apps/<app>/app/(tabs)/...`, `apps/<app>/app/...` |
| What the user has been working on | `docs/TASKS.md` |
| Known features + status | `ROADMAP.md`, `docs/TASKS.md` |
| API surface | `docs/postman/apni-kirana-store.postman_collection.json` |
| How to deploy | `docs/deployment.md` |
| How to run locally | `docs/getting-started.md` |
| How to test on Android | `docs/android-local-install.md` |

## House rules (set by the user, not me)

- **Update `docs/TASKS.md`** when shipping any feature. Append to the most-recent dated section. Backlog items move from "Backlog" → "In progress" → "Done".
- **Keep deployment docs accurate** — if I add a new env var, update both `backend/.env.example` and `.env.prod.example` and mention it in `docs/deployment.md`.
- **Smaller commits, verified end-to-end against the running stack** — not "ship + run tests + hope". The user's constraint: "we keep hitting runtime issues, work closely with me."
- **No mocking the database in tests** — there's no rule yet but assume integration over unit.
- **For UI changes on mobile**, the user tests on a physical Android phone via Expo Go AND iPhone. Always think about both.
- **Don't run `prisma db seed` in production** — it creates fake users.

## The 4 seed test users (dev only)

| Phone | Role | Name |
|---|---|---|
| `8888888881` | CUSTOMER | Zaheer Khan |
| `8888888882` | STORE_OWNER | Baqala Owner |
| `8888888883` | DRIVER | Chotu Singh |
| `9999999999` | ADMIN | Admin User |

OTP retrieval depends on `SMS_PROVIDER`:
- `CONSOLE` (dev default) → `docker compose logs backend --tail 5 | grep OTP`
- `TWOFACTOR` / `MSG91` / `TWILIO` → real SMS, but the OTP is also cached in Redis: `docker compose exec redis redis-cli GET "otp:8888888881"`

## Things I keep getting bitten by

### Docker build context mismatch
- `docker-compose.prod.yml`: backend and admin services MUST use `context: .` (monorepo root) and explicit `dockerfile: ./backend/Dockerfile` (or `./apps/admin/Dockerfile`). The Dockerfiles import from `../shared` workspace package.
- I already fixed this once. Don't re-introduce.

### Backend dev image doesn't bind-mount source
- Dev images bake source at build. Editing `backend/src/...` on host requires `docker compose cp <file> backend:/app/backend/<file>`. `tsx watch` then picks it up automatically.
- Same for admin: `docker compose cp 'apps/admin/app/(...)/file' admin:/app/apps/admin/...`
- Mobile apps run on host so they auto-reload via Expo's bundler — no sync needed.

### `.env.prod` syncing
- Editing `backend/.env` on host doesn't update the container. Must `docker compose cp backend/.env backend:/app/backend/.env` AND `docker compose restart backend`. The process won't re-read .env without a restart.

### `expo-notifications` in Expo Go SDK 53+
- Push functionality was REMOVED from Expo Go. Static `import 'expo-notifications'` THROWS at module evaluation in Expo Go.
- Solution implemented in all 3 mobile apps' `lib/notifications.ts`: lazy `require()` inside a `loadNotifications()` helper that's called per-function-entry. Detects Expo Go via `Constants.executionEnvironment === 'storeClient'` and `Constants.appOwnership === 'expo'`. Returns `null` in Expo Go so every helper short-circuits.
- For **real push delivery**, user needs an EAS Build dev client (`eas build --profile development`) — Expo Go alone won't work.

### Mobile app network errors
- Mobile apps default to `http://localhost:3000` — but on the phone, `localhost` is the phone itself, not the laptop. Backend is on **host port 3001** (Docker maps backend container :3000 → host :3001).
- Fix: each mobile app needs `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3001` set BEFORE `expo start`. Use `npx expo start --clear` after env changes (Expo bakes env into the bundle).
- Permanent fix: drop a `.env` file in each `apps/<app>/` with `EXPO_PUBLIC_API_URL=http://192.168.x.x:3001`. The .env files are in .gitignore.

### Driver.status doesn't have an "ACTIVE" enum value
- Enum is `PENDING_APPROVAL | OFFLINE | ONLINE | SUSPENDED`. After admin approves, drivers go to OFFLINE (not ACTIVE).
- Admin UI tabs show "Active" by querying `?status=ACTIVE`. Backend at `GET /admin/drivers` translates this to `status IN ('OFFLINE', 'ONLINE')`. Don't try to "fix" the enum — the translation is correct.

### The matching engine cancels orders that aren't accepted in time
- Default mode is BROADCAST: top 5 stores get notified in parallel. After 3 minutes, retry job runs `matchStoreForOrder(orderId, excludeStoreIds=[broadcasted_5])`. If no other candidates exist, status becomes CANCELLED.
- Cancel reasons now distinguish:
  - "No store currently carries these items" (first attempt found 0 candidates)
  - "No store accepted your order in time" (broadcast was sent but no one accepted)
- Admin can RESCUE cancelled orders by manually assigning a store on the order detail page — that un-cancels and resumes from STORE_ACCEPTED.

### Customer's default address might be far from any store
- During testing user sometimes has Zaheer's "Home" address pinned to Jaipur (lat 27.6, 75.14) while all seeded stores are in Delhi (lat 28.6, 77.2) — 228 km apart. The matching engine's 5km radius won't find anything; the fallback runs city-wide but distance-based scoring still ranks them poorly.
- Tell user to switch to a Delhi address (`28.616, 77.209`) when testing the order flow.

### Store owners need lat/lng to receive orders
- The matching engine filters by store coordinates. Stores without lat/lng don't get any orders.
- Store-portal `app/profile/edit.tsx` now has lat/lng inputs + "Use current location" button. Already shipped — make sure store owners are told to set their location.

### Operating hours / store-id missing
- `apps/store-portal/app/profile/operating-hours.tsx` reads `storeProfile?.id` from the in-memory Zustand store. If the user just logged in and the store profile hasn't loaded yet, that's null and the save mutation throws "Store id missing".
- Already fixed: the screen lazy-fetches `GET /api/v1/stores/me` if `storeProfile?.id` is missing. Backend endpoint exists.

### Android status bar overlap
- `app.json` for all 3 mobile apps now has `android.statusBar: { translucent: false, ... }` so the system bar takes its own space. iOS handles this automatically via SafeAreaView; Android doesn't unless you opt in.

## Backend env vars I always forget to verify

| Var | Required for | Default behavior if missing |
|---|---|---|
| `SMS_PROVIDER` | OTP delivery | falls back to `CONSOLE` (dev) |
| `TWOFACTOR_API_KEY` | only when `SMS_PROVIDER=TWOFACTOR` | dev falls back to console |
| `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` | only when `SMS_PROVIDER=MSG91` | same |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | admin web push | logs `[WebPush] (disabled — no VAPID keys)` |
| `FIREBASE_*` | raw FCM fallback (rare; Expo Push is default) | logs `[FCM] (disabled)` |
| `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` | auth | required, no fallback |

## Production deployment quick reference

**HostLelo Cloud VPS (Mumbai), Ubuntu 22.04:**

1. SSH in, `git clone`, `bash scripts/setup-vps.sh`
2. `cp .env.prod.example .env.prod`, fill in real values
3. **`sed -i 's/yourdomain.com/REAL.com/g' nginx/conf.d/*.conf`** (replace placeholder domain — easy to forget)
4. `bash scripts/init-ssl.sh api.real.com admin.real.com you@real.com`
5. `docker compose -f docker-compose.prod.yml up -d`
6. `docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy`
7. **Insert first admin user** via psql (production has NO seed):
   ```sql
   INSERT INTO "User" (id, name, phone, role, "isActive", "createdAt", "updatedAt")
   VALUES ('cl' || md5(random()::text || clock_timestamp()::text), 'Admin', '<your-phone>', 'ADMIN', true, NOW(), NOW())
   ON CONFLICT (phone) DO NOTHING;
   ```

## Test suite

- 106 backend integration tests in `backend/__tests__/`
- Run from `backend/` dir: `node_modules/.bin/jest --forceExit` (jest binary is in repo root's `node_modules/.bin/`)
- Tests use `apni_kirana_store_test` DB on the same Postgres instance — they're real integration tests, not mocks
- After ANY backend change, run at least the affected suite (`--testPathPattern=...`) before committing

## Things still on the user's wish list

See `docs/TASKS.md` "Backlog (not started)" section. Highest-impact open items at last check:
- Real-device end-to-end order flow walkthrough (needs Zaheer's address switched to Delhi first)
- iOS production push (needs Apple Developer $99/yr + APNs key uploaded to Expo)

## My consistent failures to avoid

1. Re-running `prisma db seed` accidentally in prod-shaped commands — DON'T.
2. Forgetting to `docker compose cp` after editing backend/admin source on host — the change won't be live in the container.
3. Breaking the build context in docker-compose.prod.yml — already fixed once, watch for accidental "simplifications".
4. Adding a new SMS / push / payment provider without listing it in `.env.prod.example` AND `docs/deployment.md`.
5. Telling the user "tests pass" without verifying the actual user flow on their phone — they've called this out specifically.
