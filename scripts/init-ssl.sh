#!/usr/bin/env bash
# =============================================================================
# init-ssl.sh — One-time SSL certificate initialisation via Certbot / Let's Encrypt
#
# Run this ONCE after setup-vps.sh and before starting nginx with SSL.
# Nginx must be running in HTTP-only mode (or not yet started) so that
# Certbot can reach the ACME challenge directory over port 80.
#
# Usage:
#   bash scripts/init-ssl.sh <api-domain> <admin-domain> <email>
#
# Example:
#   bash scripts/init-ssl.sh api.yourdomain.com admin.yourdomain.com you@example.com
#
# What this script does:
#   1. Validates arguments
#   2. Creates the certbot working directories
#   3. Temporarily starts nginx in HTTP-only mode (no SSL) so port 80 is open
#      and the ACME challenge path is served correctly
#   4. Runs Certbot inside a Docker container to obtain certs for both domains
#   5. Tears down the temporary nginx container
#   6. Prints next-step instructions
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

print_section() {
    echo -e "\n${GREEN}==> $1${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

# ---------------------------------------------------------------------------
# 1. Validate arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
    echo
    echo "Usage: $0 <api-domain> <admin-domain> <email>"
    echo
    echo "  api-domain   — hostname for the backend API,    e.g. api.yourdomain.com"
    echo "  admin-domain — hostname for the admin dashboard, e.g. admin.yourdomain.com"
    echo "  email        — contact email registered with Let's Encrypt"
    echo
    echo "Example:"
    echo "  $0 api.yourdomain.com admin.yourdomain.com you@example.com"
    echo
    exit 1
fi

API_DOMAIN="$1"
ADMIN_DOMAIN="$2"
CERTBOT_EMAIL="$3"

echo -e "\n${GREEN}=============================================="
echo    "  Apni Kirana Store — SSL Initialisation"
echo -e "==============================================${NC}"
echo    "  API domain:    ${API_DOMAIN}"
echo    "  Admin domain:  ${ADMIN_DOMAIN}"
echo    "  Email:         ${CERTBOT_EMAIL}"
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
# 3. Start nginx in temporary HTTP-only mode
#    We use a minimal inline config so we can serve /.well-known/acme-challenge/
#    without any SSL directives that would fail before certs exist.
# ---------------------------------------------------------------------------
print_section "Starting temporary HTTP-only nginx to serve ACME challenge"

TEMP_NGINX_CONF="$(pwd)/nginx/certbot/nginx-temp.conf"

cat > "${TEMP_NGINX_CONF}" <<NGINXCONF
events {}
http {
    server {
        listen 80;
        server_name ${API_DOMAIN} ${ADMIN_DOMAIN};

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

# Start a temporary nginx container
docker run -d \
    --name apni-kirana-temp-nginx \
    -p 80:80 \
    -v "${TEMP_NGINX_CONF}:/etc/nginx/nginx.conf:ro" \
    -v "$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot:ro" \
    nginx:alpine

echo "  Temporary nginx container started (apni-kirana-temp-nginx)."

# Give nginx a moment to bind to port 80
sleep 2

# ---------------------------------------------------------------------------
# 4. Obtain certificates with Certbot (webroot challenge)
# ---------------------------------------------------------------------------
print_section "Requesting SSL certificates from Let's Encrypt"

# We request both domains in a single Certbot run.
# The certificate is placed under /etc/letsencrypt/live/${API_DOMAIN}/
# (Certbot uses the first -d argument as the primary domain name).
docker run --rm \
    -v "$(pwd)/${CERTBOT_CONF_DIR}:/etc/letsencrypt" \
    -v "$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot" \
    certbot/certbot certonly \
        --webroot \
        --webroot-path /var/www/certbot \
        -d "${API_DOMAIN}" \
        -d "${ADMIN_DOMAIN}" \
        --email "${CERTBOT_EMAIL}" \
        --agree-tos \
        --no-eff-email \
        --non-interactive

echo -e "  ${GREEN}Certificates issued successfully.${NC}"

# ---------------------------------------------------------------------------
# 5. Stop and remove the temporary nginx container
# ---------------------------------------------------------------------------
print_section "Removing temporary nginx container"
docker stop apni-kirana-temp-nginx
docker rm   apni-kirana-temp-nginx
rm -f "${TEMP_NGINX_CONF}"
echo "  Temporary container removed."

# ---------------------------------------------------------------------------
# 6. Print next steps
# ---------------------------------------------------------------------------
echo -e "\n${GREEN}=============================================="
echo    "  SSL initialisation complete!"
echo -e "==============================================${NC}"
echo
echo "  Certificates are stored in: $(pwd)/${CERTBOT_CONF_DIR}/live/"
echo
echo "  IMPORTANT — update your nginx conf.d files:"
echo "  -------------------------------------------------------"
echo "  In nginx/conf.d/api.conf:"
echo "    Replace 'api.yourdomain.com' with '${API_DOMAIN}'"
echo "    The ssl_certificate paths already reference the correct live/ path."
echo
echo "  In nginx/conf.d/admin.conf:"
echo "    Replace 'admin.yourdomain.com' with '${ADMIN_DOMAIN}'"
echo
echo "  In nginx/conf.d/default.conf:"
echo "    Replace 'api.yourdomain.com' with '${API_DOMAIN}' in the ssl_certificate lines."
echo
echo "  Once updated, start all production services:"
echo "    docker compose -f docker-compose.prod.yml up -d"
echo
echo "  To auto-renew certificates (add to crontab on the VPS):"
echo "    0 3 * * * cd ${PROJECT_ROOT} && docker run --rm \\"
echo "        -v \$(pwd)/${CERTBOT_CONF_DIR}:/etc/letsencrypt \\"
echo "        -v \$(pwd)/${CERTBOT_WWW_DIR}:/var/www/certbot \\"
echo "        certbot/certbot renew --quiet && \\"
echo "        docker compose -f docker-compose.prod.yml exec nginx nginx -s reload"
echo
