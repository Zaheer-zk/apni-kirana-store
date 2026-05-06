#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Rolling deployment for Apni Kirana Store
#
# Run from the project root on the VPS:
#   bash scripts/deploy.sh              # full deploy with DB backup
#   bash scripts/deploy.sh --skip-backup  # skip the pg_dump step
#
# Prerequisites:
#   - Docker and docker compose are installed
#   - .env.prod exists in the project root
#   - The postgres container is running (for the backup step)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers & timestamp
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="docker-compose.prod.yml"

print_section() {
    echo -e "\n${GREEN}==> $1${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

echo -e "\n${GREEN}=============================================="
echo    "  Apni Kirana Store — Deployment"
echo    "  Started at: $(date)"
echo -e "==============================================${NC}"

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
SKIP_BACKUP=false
for arg in "$@"; do
    case $arg in
        --skip-backup)
            SKIP_BACKUP=true
            ;;
        *)
            print_error "Unknown argument: $arg"
            echo "Usage: $0 [--skip-backup]"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# 1. Preflight checks
# ---------------------------------------------------------------------------
print_section "Running preflight checks"

# Docker
if ! command -v docker &>/dev/null; then
    print_error "docker is not installed or not in PATH."
    exit 1
fi
echo "  Docker:         $(docker --version)"

# Docker Compose (v2 plugin)
if ! docker compose version &>/dev/null; then
    print_error "'docker compose' (v2 plugin) is not available."
    exit 1
fi
echo "  Docker Compose: $(docker compose version)"

# Production env file
if [[ ! -f ".env.prod" ]]; then
    print_error ".env.prod not found in $(pwd)."
    echo "  Create it by copying .env.example and filling in production values."
    exit 1
fi
echo "  .env.prod:      found"

# ---------------------------------------------------------------------------
# 2. Database backup (unless --skip-backup)
# ---------------------------------------------------------------------------
if [[ "${SKIP_BACKUP}" == false ]]; then
    print_section "Backing up PostgreSQL database"

    BACKUP_DIR="backups"
    mkdir -p "${BACKUP_DIR}"

    BACKUP_FILE="${BACKUP_DIR}/db_${TIMESTAMP}.sql"

    echo "  Dumping database to ${BACKUP_FILE} ..."
    if docker compose -f "${COMPOSE_FILE}" exec -T postgres \
        pg_dump -U postgres apni_kirana_store > "${BACKUP_FILE}"; then
        echo "  Backup saved: ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"
    else
        print_error "pg_dump failed. Aborting deployment to protect data."
        rm -f "${BACKUP_FILE}"
        exit 1
    fi
else
    echo -e "\n${RED}  WARNING: --skip-backup specified. Skipping database backup.${NC}"
fi

# ---------------------------------------------------------------------------
# 3. Pull latest code
# ---------------------------------------------------------------------------
print_section "Pulling latest code from origin/main"
git pull origin main

# ---------------------------------------------------------------------------
# 4. Build new Docker images (no cache to ensure fresh layers)
# ---------------------------------------------------------------------------
print_section "Building backend and admin images (--no-cache)"
docker compose -f "${COMPOSE_FILE}" build --no-cache backend admin

# ---------------------------------------------------------------------------
# 5. Run database migrations
# ---------------------------------------------------------------------------
print_section "Running Prisma database migrations"
docker compose -f "${COMPOSE_FILE}" run --rm backend npx prisma migrate deploy

# ---------------------------------------------------------------------------
# 6. Rolling restart — bring up new containers, remove orphans
# ---------------------------------------------------------------------------
print_section "Starting updated containers"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

# ---------------------------------------------------------------------------
# 7. Health check — wait for the backend to be ready
# ---------------------------------------------------------------------------
print_section "Waiting 10 seconds for containers to initialise..."
sleep 10

echo "  Running health check against backend..."
# The health endpoint is proxied by nginx, but we hit the backend directly
# via the docker network to avoid depending on nginx being healthy too.
if docker compose -f "${COMPOSE_FILE}" exec -T backend \
    curl -sf http://localhost:3000/health > /dev/null; then
    echo -e "  ${GREEN}Health check passed.${NC}"
else
    print_error "Health check failed after deployment."
    echo "  Check container logs:"
    echo "    docker compose -f ${COMPOSE_FILE} logs --tail=50 backend"
    exit 1
fi

# ---------------------------------------------------------------------------
# 8. Clean up dangling images to reclaim disk space
# ---------------------------------------------------------------------------
print_section "Pruning unused Docker images"
docker image prune -f

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo -e "\n${GREEN}=============================================="
echo    "  Deployment successful!"
echo    "  Finished at: $(date)"
echo -e "==============================================${NC}"
echo
echo "  Running containers:"
docker compose -f "${COMPOSE_FILE}" ps
echo
