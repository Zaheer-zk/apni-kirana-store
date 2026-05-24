#!/usr/bin/env bash
# =============================================================================
# init-ssl.sh — SSL certificate (re)issuance via Certbot / Let's Encrypt
#
# Run this when standing up a new deployment OR adding/removing domains.
# Safe to re-run: certbot is invoked with --expand --cert-name so the
# existing certificate is updated in place instead of a new lineage
# (cert-name-0001, etc.) being created.
#
# Usage:
#   bash scripts/init-ssl.sh <domain1> [<domain2> ... <domainN>] <email>
#
# Examples:
#   bash scripts/init-ssl.sh api.example.com admin.example.com you@example.com
#   bash scripts/init-ssl.sh api.example.com admin.example.com \
#       store.example.com driver.example.com shop.example.com you@example.com
#
# Behaviour:
#   * Detects whether the production stack already owns port 80.
#       - If yes, runs certbot through the existing nginx via the shared
#         webroot mount that docker-compose.prod.yml already wires up.
#       - If no, spins up a small temporary nginx on port 80 to serve the
#         ACME challenge, then tears it down.
#   * Uses --webroot --expand --cert-name <first-domain> so all SANs end up
#     under nginx/certbot/conf/live/<first-domain>/.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_section() {
    echo -e "\n${GREEN}==> $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}WARN: $1${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

usage() {
    cat <<USAGE

Usage: $0 <domain1> [<domain2> ... <domainN>] <email>

  domain1..N — one or more hostnames to include on the certificate
               (the first is used as the cert lineage name)
  email      — contact email registered with Let's Encrypt
               (must be the LAST argument and contain "@")

Examples:
  $0 api.example.com admin.example.com you@example.com
  $0 api.example.com admin.example.com store.example.com \\
      driver.example.com shop.example.com you@example.com

USAGE
}

# ---------------------------------------------------------------------------
# 1. Parse + validate arguments
# ---------------------------------------------------------------------------
# Need at least one domain + an email.
if [[ $# -lt 2 ]]; then
    usage
    exit 1
fi

# Last positional arg is the email; everything before it is a domain.
CERTBOT_EMAIL="${@: -1}"
DOMAINS=( "${@:1:$#-1}" )

if [[ "${CERTBOT_EMAIL}" != *"@"* ]]; then
    print_error "Last argument must be an email address (got: '${CERTBOT_EMAIL}')."
    usage
    exit 1
fi

if [[ ${#DOMAINS[@]} -lt 1 ]]; then
    print_error "At least one domain is required before the email."
    usage
    exit 1
fi

PRIMARY_DOMAIN="${DOMAINS[0]}"

# Build the repeated `-d <domain>` flags for certbot.
CERTBOT_DOMAIN_FLAGS=()
for d in "${DOMAINS[@]}"; do
    CERTBOT_DOMAIN_FLAGS+=( -d "$d" )
done

echo -e "\n${GREEN}=============================================="
echo    "  Apni Kirana Store — SSL Initialisation"
echo -e "==============================================${NC}"
echo    "  Domains (${#DOMAINS[@]}):"
for d in "${DOMAINS[@]}"; do
    echo  "    - ${d}"
done
echo    "  Email:         ${CERTBOT_EMAIL}"
echo    "  Cert lineage:  ${PRIMARY_DOMAIN}"
echo    "  Date:          $(date)"

# Make sure we're in the project root (the directory that contains docker-compose files)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
cd "${PROJECT_ROOT}"
echo    "  Project root:  ${PROJECT_ROOT}"

# ---------------------------------------------------------------------------
# 2. Create certbot directories
# ---------------------------------------------------------------------------
print_section "Creating certbot working directories"

CERTBOT_CONF_DIR="nginx/certbot/conf"
CERTBOT_WWW_DIR="nginx/certbot/www"

mkdir -p "${CERTBOT_CONF_DIR}"
mkdir -p "${CERTBOT_WWW_DIR}"

echo "  Created: ${CERTBOT_CONF_DIR}"
echo "  Created: ${CERTBOT_WWW_DIR}"

# ---------------------------------------------------------------------------
# 3. Detect whether something already owns port 80
# ---------------------------------------------------------------------------
print_section "Checking port 80"

PORT_80_OWNER=""
if command -v docker >/dev/null 2>&1; then
    # Look for any container that publishes :80->.
    PORT_80_OWNER="$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
        | awk -F'\t' '$2 ~ /:80->/ {print $1; exit}')"
fi

USE_TEMP_NGINX=true
if [[ -n "${PORT_80_OWNER}" ]]; then
    echo "  Port 80 is currently held by container: ${PORT_80_OWNER}"
    echo "  Skipping temporary nginx — will issue certs through the running stack."
    USE_TEMP_NGINX=false
else
    echo "  Port 80 is free — will start a temporary nginx for the ACME challenge."
fi

# ---------------------------------------------------------------------------
# 4a. (Optional) Start nginx in temporary HTTP-only mode
#     We use a minimal inline config so we can serve /.well-known/acme-challenge/
#     without any SSL directives that would fail before certs exist.
# ---------------------------------------------------------------------------
TEMP_NGINX_CONF=""
if [[ "${USE_TEMP_NGINX}" == "true" ]]; then
    print_section "Starting temporary HTTP-only nginx to serve ACME challenge"

    TEMP_NGINX_CONF="$(pwd)/nginx/certbot/nginx-temp.conf"

    # `server_name` lists every requested domain so nginx accepts the ACME
    # challenge request for each one.
    TEMP_SERVER_NAMES="${DOMAINS[*]}"

    cat > "${TEMP_NGINX_CONF}" <<NGINXCONF
events {}
http {
    server {
        listen 80;
        server_name ${TEMP_SERVER_NAMES};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'SSL init in progress';
            add_header Content-Type text/plain;
        }
    }
}
NGINXCONF

    echo "  Temporary nginx config written to: ${TEMP_NGINX_CONF}"

    # Make sure any leftover container from a previous failed run is gone.
    docker rm -f apni-kirana-temp-nginx >/dev/null 2>&1 || true

    # Start a temporary nginx container.
    docker run -d \
        --name apni-kirana-temp-nginx \
        -p 80:80 \
        -v "${TEMP_NGINX_CONF}:/etc/nginx/nginx.conf:ro" \
        -v "$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot:ro" \
        nginx:alpine

    echo "  Temporary nginx container started (apni-kirana-temp-nginx)."

    # Give nginx a moment to bind to port 80.
    sleep 2
fi

# ---------------------------------------------------------------------------
# 4b. Obtain / renew certificates with Certbot (webroot challenge)
# ---------------------------------------------------------------------------
print_section "Requesting SSL certificates from Let's Encrypt"

# --expand + --cert-name keep all SANs under a single lineage so the cert
# files always live at nginx/certbot/conf/live/${PRIMARY_DOMAIN}/. Re-runs
# update the same lineage rather than producing -0001 / -0002 siblings.
docker run --rm \
    -v "$(pwd)/${CERTBOT_CONF_DIR}:/etc/letsencrypt" \
    -v "$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot" \
    certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --expand \
        --cert-name "${PRIMARY_DOMAIN}" \
        "${CERTBOT_DOMAIN_FLAGS[@]}" \
        --email "${CERTBOT_EMAIL}" \
        --agree-tos \
        --no-eff-email \
        --non-interactive

echo -e "  ${GREEN}Certificates issued successfully.${NC}"

# ---------------------------------------------------------------------------
# 5. Teardown of temporary nginx (only if we started it)
# ---------------------------------------------------------------------------
if [[ "${USE_TEMP_NGINX}" == "true" ]]; then
    print_section "Removing temporary nginx container"
    docker stop apni-kirana-temp-nginx >/dev/null
    docker rm   apni-kirana-temp-nginx >/dev/null
    if [[ -n "${TEMP_NGINX_CONF}" && -f "${TEMP_NGINX_CONF}" ]]; then
        rm -f "${TEMP_NGINX_CONF}"
    fi
    echo "  Temporary container removed."
else
    print_section "Reloading running nginx so new certs take effect"
    # Best-effort: if the user's production compose project uses a service
    # named `nginx`, reload it; otherwise just print a hint.
    if docker compose -f docker-compose.prod.yml ps nginx >/dev/null 2>&1; then
        docker compose -f docker-compose.prod.yml exec nginx nginx -s reload \
            || print_warn "Could not reload nginx automatically — reload it manually."
    else
        print_warn "Reload your running nginx manually so the new cert is picked up."
    fi
fi

# ---------------------------------------------------------------------------
# 6. Print next steps
# ---------------------------------------------------------------------------
echo -e "\n${GREEN}=============================================="
echo    "  SSL initialisation complete!"
echo -e "==============================================${NC}"
echo
echo "  Certificates are stored under:"
echo "    $(pwd)/${CERTBOT_CONF_DIR}/live/${PRIMARY_DOMAIN}/"
echo
echo "  NOTE — nginx vhosts under nginx/conf.d/ should all reference"
echo "  this single cert lineage, e.g.:"
echo "    ssl_certificate     /etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem;"
echo "    ssl_certificate_key /etc/letsencrypt/live/${PRIMARY_DOMAIN}/privkey.pem;"
echo
echo "  Each server block sets its own server_name; the cert covers all"
echo "  ${#DOMAINS[@]} hostnames as Subject Alternative Names."
echo
echo "  Start (or restart) production services:"
echo "    docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build"
echo
echo "  To auto-renew certificates (add to crontab on the VPS):"
echo "    0 3 * * * cd ${PROJECT_ROOT} && docker run --rm \\"
echo "        -v \$(pwd)/${CERTBOT_CONF_DIR}:/etc/letsencrypt \\"
echo "        -v \$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot \\"
echo "        certbot/certbot renew --quiet && \\"
echo "        docker compose --env-file .env.prod -f docker-compose.prod.yml exec nginx nginx -s reload"
echo
