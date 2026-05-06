# Docker Setup

How the dev stack is containerised, why ports are the way they are, and the commands you'll use day-to-day.

## Container topology

| Service | Image base | Container port | Host port | Depends on |
| --- | --- | --- | --- | --- |
| `postgres` | `postgres:16` | 5432 | **5433** | — |
| `redis` | `redis:7-alpine` | 6379 | 6379 | — |
| `backend` | `node:20-slim` (custom) | 3000 | **3001** | postgres, redis |
| `admin` | `node:20-slim` (custom) | 3000 | **3000** | backend |

All four sit on a Docker bridge network. Containers reach each other by **service name** (`postgres`, `redis`, `backend`) — not via `localhost`.

## Networking — internal vs external

| Caller → Target | Address |
| --- | --- |
| `backend` container → Postgres | `postgres:5432` |
| `backend` container → Redis | `redis:6379` |
| Your laptop → Postgres | `localhost:5433` |
| Your laptop → Backend | `localhost:3001` |
| Your phone (on Wi-Fi) → Backend | `http://<LAN-IP>:3001` |
| Browser → Admin | `http://localhost:3000` |
| `admin` container → Backend | `http://backend:3000` |

> The most common mistake is putting `localhost` in a containerised service's env. Inside a container, `localhost` is the container itself.

## Why these specific host ports

- **Postgres on 5433, not 5432** — macOS reserves `5432` internally for some background services and many devs already have a local Postgres on it. Using `5433` avoids the clash.
- **Backend on 3001, not 3000** — we keep `3000` free for the **admin dashboard** because that's the URL humans type into a browser. The backend is mostly accessed by app code, so a non-default port is fine.
- **Inside containers** both backend and admin are on `3000` — this is just easier for Next.js / Express defaults.

## Environment variables

The backend uses a layered approach:

1. `.env` file (committed `.env.example`, copy to `.env` locally) — defaults like JWT secrets and feature flags.
2. `docker-compose.yml` `environment:` block — overrides the connection strings so they use Docker service names:

   ```yaml
   environment:
     DATABASE_URL: postgresql://postgres:postgres@postgres:5432/apni_kirana_store
     REDIS_URL: redis://redis:6379
   ```

This means the same `.env` works for both Docker-run and host-run backends — only the URLs differ.

## Build context

Both backend and admin Dockerfiles are built with the **monorepo root** as their build context. This is required because they import from the `shared/` workspace package (types, validators, constants). Example from `docker-compose.yml`:

```yaml
backend:
  build:
    context: .
    dockerfile: apps/backend/Dockerfile
```

The Dockerfile copies `shared/` and the app folder, then runs `npm install` against the workspace.

## Hot reload — not in Docker

In the current setup, Docker images are built once and changes to source code do **not** reflect until you rebuild. This is intentional for parity with prod.

For active backend development, you can run the backend on the host instead:

```bash
docker compose up -d postgres redis
cd apps/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/apni_kirana_store \
REDIS_URL=redis://localhost:6379 \
npm run dev
```

This gives you `nodemon` reloads while still using the containerised data layer.

## Common commands

```bash
# Build all images
docker compose build

# Build a single service
docker compose build backend

# Start everything in the background
docker compose up -d

# Tail logs of a specific service
docker compose logs -f backend
docker compose logs -f admin
docker compose logs -f postgres
docker compose logs -f redis

# Stop everything (data preserved)
docker compose down

# Stop AND wipe volumes (drops the DB and Redis state)
docker compose down -v

# Restart a single service (e.g. after env change)
docker compose restart backend

# Run a one-off command in a container
docker compose exec backend npm run prisma:migrate
docker compose exec backend npx prisma db seed

# Open Prisma Studio inside the container, then visit http://localhost:5555
docker compose exec backend npx prisma studio --port 5555 --browser none

# Get a psql shell
docker compose exec postgres psql -U postgres -d apni_kirana_store

# Get a redis shell
docker compose exec redis redis-cli
```

## Troubleshooting

### "Port 5432 already in use"

macOS reserves `5432` for an internal service, and some devs run a local Postgres. We map to `5433` instead.

If `5433` is also taken, find what's holding it:

```bash
lsof -i:5433
```

Kill the offender, or change the host port in `docker-compose.yml`.

### Backend exits with `MODULE_NOT_FOUND`

This usually means a dependency was added but the image wasn't rebuilt:

```bash
docker compose build backend && docker compose up -d backend
```

### Admin returns 500 on every page

Check the logs first:

```bash
docker compose logs admin
```

Most often it's a missing module post-`npm install` or a missing env var (e.g. `NEXT_PUBLIC_API_URL`). Rebuild after fixing:

```bash
docker compose build admin && docker compose up -d admin
```

### "Container exits immediately"

Tail the logs at startup time:

```bash
docker compose up backend  # foreground, so you see crash output
```

The first error in the log is almost always the actual cause.

### Prisma "OpenSSL not detected" warning

We deliberately use `node:20-slim` (Debian-based) rather than `node:20-alpine`. The Alpine image bundles `musl` and `libssl 3.x` in a layout Prisma's bundled query engine doesn't fully support, and it triggers warnings or panics on certain queries. Slim avoids this entirely.
