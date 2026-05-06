# Troubleshooting

The most common dev environment issues, and exactly how to fix them.

## Docker

### "Bind for 0.0.0.0:5432 failed: port is already allocated"

Something else (often a local Postgres install or macOS) is on `5432`. We deliberately map to `5433` instead — make sure your `docker-compose.yml` reflects that. If `5433` is also in use:

```bash
lsof -i:5433
# Kill the offender, OR change the host port:
# postgres:
#   ports:
#     - "5434:5432"
```

Update `DATABASE_URL` if you change the host port.

### "Port 3000 already in use"

Something else is using `3000` (often another Next.js dev server). Either stop it or change the admin's host port in `docker-compose.yml`:

```yaml
admin:
  ports:
    - "3010:3000"
```

### Container exits immediately on `up`

```bash
docker compose up backend  # foreground; you'll see the crash output
```

The first exception is the actual cause — usually a missing env var or unreachable DB.

### Backend can't reach Postgres

Inside a container, **never** use `localhost` for Postgres / Redis. Use the service name:

```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/apni_kirana_store
REDIS_URL=redis://redis:6379
```

## Expo / React Native

### "Cannot find module '<something>'" when starting Expo

Dependencies weren't installed in this app. Each Expo app has its own `package.json`:

```bash
cd apps/customer  # or driver / store-portal
npm install
```

### Metro errors about duplicate React / React Native in monorepo

This is the classic Expo + workspaces footgun. Our setup intentionally **excludes** the Expo apps from the root `workspaces` array and uses `file:../../shared` for the shared package. If you accidentally added an Expo app to workspaces, remove it.

Then clear caches:

```bash
cd apps/customer
rm -rf node_modules .expo
npm install
npx expo start --clear
```

### Phone can't connect to Metro / "Unable to load script"

Checklist:

- Phone and laptop on the **same Wi-Fi**.
- Laptop firewall isn't blocking ports 8081/8082/8083 (macOS: System Settings → Network → Firewall).
- Started Expo with `--lan` (not `--tunnel`, which is slower and unrelated, and not the default `localhost`).
- `EXPO_PUBLIC_API_URL` uses your **LAN IP** (`ipconfig getifaddr en0`), not `localhost`.

If your network is hostile to LAN traffic (corporate Wi-Fi, captive portals), fall back to `--tunnel`:

```bash
npx expo start --tunnel
```

### "OTP not received"

In dev mode the OTP is **logged**, not sent via SMS (saves Twilio credits). Tail the backend:

```bash
docker compose logs -f backend | grep OTP
```

To force real SMS in dev, set `SMS_PROVIDER=twilio` in `.env` and restart the backend.

## Prisma

### "Cannot find module '.prisma/client'"

The Prisma Client wasn't generated. After every `schema.prisma` change:

```bash
docker compose exec backend npx prisma generate
# OR locally
cd apps/backend && npx prisma generate
```

Rebuild the Docker image after schema changes so `npm postinstall` re-generates inside the container:

```bash
docker compose build backend && docker compose up -d backend
```

### "Migration failed" / "Database is out of sync"

For dev, the nuclear option is fine:

```bash
docker compose down -v   # wipes volumes
docker compose up -d
docker compose exec backend npx prisma migrate deploy
```

**Never** do this in prod.

### Database connection refused

Postgres is still booting or unhealthy:

```bash
docker compose ps
# If postgres is "starting" or "unhealthy", wait or check:
docker compose logs postgres
```

The backend has a `depends_on: { postgres: { condition: service_healthy } }` so this shouldn't bite on a fresh `up`.

## Backend

### Backend keeps restarting

```bash
docker compose logs backend
```

Look at the last ~50 lines — the crash is usually obvious. Common culprits:

- Missing env var (often `JWT_ACCESS_SECRET`, `DATABASE_URL`).
- Unreachable Redis / Postgres.
- Unrun migration — connect with Prisma Studio to confirm the schema matches.

### Socket.io connect_error

The token is missing, expired, or invalid. The mobile client should call `/auth/refresh` and reconnect. If you see this in dev right after login, double-check `EXPO_PUBLIC_API_URL` matches the backend you actually logged in against.

## Admin dashboard

### Admin returns 500 on every page

```bash
docker compose logs admin
```

Often a missing `NEXT_PUBLIC_API_URL` or a missing module. Rebuild after fixing:

```bash
docker compose build admin && docker compose up -d admin
```

### "Hydration mismatch" warnings

Usually harmless in dev (date formatting differs server vs. client). Wrap dynamic timestamps in `<ClientOnly>` or `useEffect`-set state to silence in production.

## Networking quick reference

| From | To | Address |
| --- | --- | --- |
| Browser | Admin | `http://localhost:3000` |
| Browser | Backend | `http://localhost:3001` |
| Phone (Expo) | Backend | `http://<LAN-IP>:3001` |
| `backend` container | Postgres | `postgres:5432` |
| `backend` container | Redis | `redis:6379` |
| `admin` container | Backend | `http://backend:3000` |

If you're ever unsure which side of the container boundary you're on, ask: "Is this code running inside Docker?" If yes, use service names. If no, use `localhost` + the host-mapped port.
