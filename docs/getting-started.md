# Getting Started

This guide gets the entire Apni Kirana Store stack running on your laptop in under 10 minutes.

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Docker Desktop | latest | Runs Postgres, Redis, backend, admin |
| Node.js | 20+ | Runs the Expo apps on the host |
| npm | 10+ | Package management |
| Expo Go | latest | Install on your phone (iOS App Store / Google Play) for live testing |
| A phone on the same Wi-Fi as your laptop | — | To scan the Expo QR code |

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

The first run will pull images and build, which takes a few minutes. Subsequent starts are nearly instant.

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

First, find your laptop's LAN IP:

```bash
ipconfig getifaddr en0
# example output: 192.168.1.42
```

> If you're on Wi-Fi via a different interface (e.g. `en1`), substitute accordingly. On Linux use `hostname -I`.

Then in three terminals:

```bash
# Terminal 1 — Customer app
cd apps/customer
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --lan
```

```bash
# Terminal 2 — Driver app (different Metro port)
cd apps/driver
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --port 8082 --lan
```

```bash
# Terminal 3 — Store Portal app
cd apps/store-portal
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start --port 8083 --lan
```

Scan the QR code shown in each terminal with **Expo Go** (Android) or the **Camera app** (iOS). The app will load over your LAN.

> Important: Use your LAN IP, **not** `localhost`. `localhost` on your phone refers to the phone itself.

## Step 4 — Test the login flow

1. In the Customer app, enter phone number `9999988888`.
2. Tap "Send OTP".
3. The OTP is **printed to the backend logs** in dev mode (Twilio is bypassed to save cost):

   ```bash
   docker compose logs -f backend | grep OTP
   ```

4. Enter the OTP. You're in.

The same flow works for the Driver and Store Portal apps with their respective phone numbers.

## Stopping things

```bash
# Stop all containers (preserves data)
docker compose down

# Stop and wipe the database / Redis volumes (full reset)
docker compose down -v
```

## Next steps

- [Architecture](./architecture.md) — how the pieces fit together
- [Docker Setup](./docker-setup.md) — deeper dive into the container setup
- [Troubleshooting](./troubleshooting.md) — when things go wrong
