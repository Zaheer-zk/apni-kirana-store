# Getting Started

This guide gets the entire Apni Kirana Store stack running on your laptop in under 10 minutes, then walks through the day-to-day commands you'll actually use.

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Docker Desktop | latest | Runs Postgres, Redis, backend, admin |
| Node.js | 20+ | Runs the Expo apps on the host |
| npm | 10+ | Package management |
| Expo Go | latest | Install on your phone (iOS App Store / Google Play) for live testing |
| A phone on the same Wi-Fi as your laptop | — | To scan the Expo QR code (push notifications require a real device — simulators don't get them) |

> Tip: On macOS, `brew install --cask docker` is the fastest way to get Docker Desktop.

## Step 1 — Start the backend stack

From the repo root:

```bash
docker compose up -d
```

This starts four containers:

- `postgres` — PostgreSQL 16 (host port `5433` → container `5432`)
- `redis` — Redis 7 (host port `6379`)
- `backend` — Express API (host port `3001` → container `3000`)
- `admin` — Next.js 15 dashboard (host port `3000`)

First run pulls + builds (~5 min). Subsequent starts are nearly instant.

## Step 2 — Verify everything is up

| Check | URL / Command | Expected |
| --- | --- | --- |
| Admin dashboard | http://localhost:3000 | Login screen renders |
| Backend health | http://localhost:3001/health | `{ "status": "ok" }` |
| Postgres | `localhost:5433` (user `postgres`, pass `postgres`, db `apni_kirana_store`) | Connection succeeds |
| Redis | `localhost:6379` | `PONG` to `redis-cli ping` |
| Container status | `docker compose ps` | All four `Up (healthy)` |

If any container is unhealthy:

```bash
docker compose logs -f <service>
```

## Step 3 — Run the mobile apps

Expo apps run on the **host** (not in Docker) so they are reachable from your phone over your LAN. Open a separate terminal for each app.

Find your laptop's LAN IP:

```bash
ipconfig getifaddr en0
# example: 192.168.1.42
# (Linux: hostname -I)
```

Then in three terminals (any port assignment works as long as they don't collide):

```bash
# Terminal 1 — Customer (default port 8081)
cd apps/customer
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --lan
```

```bash
# Terminal 2 — Store Portal (port 8082)
cd apps/store-portal
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --port 8082 --lan
```

```bash
# Terminal 3 — Driver (port 8083)
cd apps/driver
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --port 8083 --lan
```

Scan the QR code shown in each terminal with **Expo Go** (Android) or the **Camera app** (iOS). The app will load over your LAN.

> Use your LAN IP, **not** `localhost`. `localhost` on your phone refers to the phone itself.

If a port is already taken: `lsof -ti :8081 | xargs kill`.

## Step 4 — Log in with seed users

The DB is pre-seeded with one user per role:

| App | Phone | OTP |
|---|---|---|
| Customer (Zaheer Khan) | `8888888881` | any 6 digits in dev — see "Get the OTP" below |
| Store Portal (Baqala Owner) | `8888888882` | same |
| Driver (Chotu Singh) | `8888888883` | same |
| Admin (browser at :3000) | `9999999999` | same |

Send OTP from the app, retrieve it from the backend, verify, you're in.

### Get the OTP

```bash
# When SMS_PROVIDER=CONSOLE (dev default) — OTP is logged to backend stdout
docker compose logs backend --tail 5 | grep OTP

# When SMS_PROVIDER=TWOFACTOR / MSG91 / TWILIO — real SMS goes to phone,
# but Redis still holds the OTP for 5 minutes so you can grab it without a SIM:
docker compose exec redis redis-cli GET "otp:8888888881"
```

For real SMS in production, see [deployment.md § SMS OTP setup](./deployment.md#sms-otp-setup).

## Step 5 — Walk through one full order

To watch the entire pipeline light up:

1. **Customer app:** log in as Zaheer → if his default address is in Jaipur, switch to a Delhi address (`28.616, 77.209`) so the matching engine hits Baqala on distance instead of falling through to the city-wide fallback
2. Add 2-3 items from Baqala → Place order
3. **Watch in parallel:**
   - Customer phone: `ORDER_PLACED` push
   - Store-portal phone: `STORE_ORDER_OFFERED` push (vibration + sound)
   - Admin browser: bell badge increments via `ADMIN_ORDER_PLACED`
   - Backend logs: `[Match] Broadcasting order ... to N stores`
4. **Store-portal:** Accept → `STORE_ACCEPTED` flows to customer + admin
5. **Driver app:** go online → `DRIVER_NEW_DELIVERY` arrives → accept
6. Driver scans/enters pickup OTP → marks "Picked up" → customer sees `ORDER_PICKED_UP` with dropoff OTP
7. Driver enters dropoff OTP → marks delivered → customer rates
8. Try the **Chat** button on any active order — messages appear live across all 3 phones via Socket.io
9. Open admin → Orders → click the order → bottom of the page shows the full chat history (read-only) for fraud review

## Day-to-day commands

### Backend stack

```bash
docker compose up -d                      # start everything
docker compose ps                         # check status
docker compose logs -f backend            # tail backend
docker compose logs -f admin              # tail admin
docker compose restart backend            # after .env changes
docker compose stop                       # stop (keeps data)
docker compose down                       # remove containers (keeps volumes)
docker compose down -v                    # full reset (wipes DB + Redis)
```

### Database

```bash
# psql shell
docker compose exec postgres psql -U postgres -d apni_kirana_store

# One-shot query
docker compose exec -T postgres psql -U postgres -d apni_kirana_store \
  -c "SELECT name, role, phone FROM \"User\" LIMIT 10;"

# Apply pending migrations (after schema.prisma changes)
docker compose exec -T backend npx prisma migrate deploy
docker compose exec -T backend npx prisma generate
npx prisma generate --schema=backend/prisma/schema.prisma  # host types

# Re-seed (wipes + reloads test data)
docker compose exec -T backend npx prisma db seed

# Prisma Studio GUI
docker compose exec backend npx prisma studio --port 5555
# → http://localhost:5555
```

### Tests

```bash
# All 8 backend suites (~106 tests)
cd backend && /Users/zaheerkhan/Shared/P-p/apni-kirana-store/node_modules/.bin/jest --forceExit

# One suite
cd backend && /Users/zaheerkhan/Shared/P-p/apni-kirana-store/node_modules/.bin/jest --testPathPattern=admin --forceExit
```

### Sync local edits → Docker

The dev images don't bind-mount your source. After editing backend or admin code:

```bash
# Backend file → container (tsx watch picks it up automatically)
docker compose cp backend/src/routes/orders.routes.ts \
  backend:/app/backend/src/routes/orders.routes.ts

# Admin file → container (Next.js dev server reloads automatically)
docker compose cp 'apps/admin/app/(dashboard)/orders/page.tsx' \
  'admin:/app/apps/admin/app/(dashboard)/orders/page.tsx'
```

> Mobile apps run on the host, so editing them auto-reloads via Expo's bundler — no sync needed.

### Quick API smoke test

```bash
# Send OTP
curl -X POST http://localhost:3001/api/v1/auth/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"8888888881"}'

# Capture token
TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"8888888881","otp":"123456","role":"CUSTOMER"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Call any authed endpoint
curl http://localhost:3001/api/v1/users/me -H "Authorization: Bearer $TOKEN"
```

For exploring the full API surface, **import the Postman collection** at [docs/postman/](./postman/) — it has every endpoint with auto-token capture and seed-user variables.

### Common debug queries

```bash
# Active orders right now
docker compose exec -T postgres psql -U postgres -d apni_kirana_store -c \
  "SELECT id, status, \"createdAt\" FROM \"Order\"
   WHERE status NOT IN ('DELIVERED','CANCELLED','REJECTED')
   ORDER BY \"createdAt\" DESC LIMIT 10"

# Currently registered push devices per user
docker compose exec -T postgres psql -U postgres -d apni_kirana_store -c \
  "SELECT u.name, d.platform, LEFT(d.token, 30) AS token, d.\"lastSeenAt\"
   FROM \"Device\" d JOIN \"User\" u ON u.id = d.\"userId\"
   ORDER BY d.\"lastSeenAt\" DESC"

# Open chat threads (with message counts)
docker compose exec -T postgres psql -U postgres -d apni_kirana_store -c \
  "SELECT c.\"orderId\", c.\"closedAt\", c.\"deletedAt\",
          (SELECT COUNT(*) FROM \"ChatMessage\" m WHERE m.\"chatId\" = c.id) AS msgs
   FROM \"Chat\" c ORDER BY c.\"updatedAt\" DESC LIMIT 10"
```

### Watching what matters

```bash
docker compose logs -f backend | grep -E "OTP|Error|FAIL|notify|Expo|FCM|\[Match\]"
```

### Reset Redis / queues

```bash
docker compose exec redis redis-cli FLUSHDB    # wipes BullMQ jobs + OTP cache
docker compose restart backend
```

## Switching to real SMS OTP

Once you sign up for [2Factor.in](https://2factor.in) (free 100 OTP/day):

```bash
# In backend/.env
SMS_PROVIDER=TWOFACTOR
TWOFACTOR_API_KEY=<your-uuid-from-2factor-dashboard>
TWOFACTOR_TEMPLATE=OTP1

# Pick up the change
docker compose cp backend/.env backend:/app/backend/.env
docker compose restart backend
```

Now `POST /api/v1/auth/send-otp` delivers a real SMS within ~5s. The OTP is still cached in Redis for 5 minutes, so you can grab it via `redis-cli GET otp:<phone>` if your SIM is unavailable.

Full guide with MSG91 / Twilio alternatives in [deployment.md § SMS OTP setup](./deployment.md#sms-otp-setup).

## Stopping things

```bash
docker compose stop      # stops containers, keeps DB + Redis volumes
docker compose down      # removes containers, keeps volumes
docker compose down -v   # full reset — wipes DB and Redis (re-seed needed)
```

Mobile dev servers stop with `Ctrl+C` in their terminal.

## Next steps

- [TASKS.md](./TASKS.md) — running log of completed work and current backlog
- [Architecture](./architecture.md) — how the pieces fit together
- [Notifications](./notifications.md) — Expo Push, web push, and the templated `notify()` system
- [Docker Setup](./docker-setup.md) — deeper dive into the container setup
- [Android local install](./android-local-install.md) — sideload the apps on your own phone for testing
- [Deployment](./deployment.md) — go to production on HostLelo (or any Ubuntu VPS)
- [Postman collection](./postman/) — every API endpoint, importable
- [Troubleshooting](./troubleshooting.md) — when things go wrong
