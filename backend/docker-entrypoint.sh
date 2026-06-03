#!/bin/sh
# Backend container entrypoint.
#
# Auto-applies any pending Prisma migrations BEFORE the API process starts.
# Without this step, every rebuild that adds new columns / tables would
# 500 on the first request that touches the new schema until an operator
# manually ran `prisma migrate deploy` against the container. The May/June
# rollouts hit that class of bug several times.
#
# `migrate deploy`:
#   - is non-interactive (safe for containers)
#   - never resets or drops anything
#   - is idempotent — already-applied migrations are skipped
#   - exits non-zero if a migration fails, which keeps the container from
#     starting in a half-broken state (better than serving 500s silently)
#
# Skip with MIGRATE_ON_START=false if you want manual control (e.g. for a
# canary container that should NOT apply schema before the rest of the
# fleet has rolled).

set -e

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] Applying pending Prisma migrations..."
  npx prisma migrate deploy --schema=./prisma/schema.prisma
  echo "[entrypoint] Migrations done. Starting app."
else
  echo "[entrypoint] MIGRATE_ON_START=false — skipping migrations."
fi

exec node dist/index.js
