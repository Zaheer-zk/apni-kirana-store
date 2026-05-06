#!/usr/bin/env bash
# =============================================================================
# setup-vps.sh — One-time Ubuntu VPS provisioning for Apni Kirana Store
#
# Run as root or with sudo:
#   sudo bash setup-vps.sh
#
# What this script does:
#   1. Updates & upgrades system packages
#   2. Installs essential tools (curl, git, ufw, fail2ban)
#   3. Installs Docker Engine via the official convenience script
#   4. Installs Docker Compose plugin
#   5. Adds the invoking user to the docker group
#   6. Hardens the firewall with UFW (SSH / HTTP / HTTPS only)
#   7. Configures fail2ban to protect SSH
#   8. Enables unattended security updates
#   9. Creates the application directory at /opt/apni-kirana-store
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'   # No colour / reset

print_section() {
    echo -e "\n${GREEN}==> $1${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

# ---------------------------------------------------------------------------
# Guard: must be running on Ubuntu
# ---------------------------------------------------------------------------
if [[ ! -f /etc/os-release ]] || ! grep -qi "ubuntu" /etc/os-release; then
    print_error "This script is intended for Ubuntu only. Aborting."
    exit 1
fi

# Guard: must be run as root
if [[ $EUID -ne 0 ]]; then
    print_error "Please run this script as root or with sudo."
    exit 1
fi

# ---------------------------------------------------------------------------
# Derive the non-root user who invoked sudo (fall back to root if needed)
# ---------------------------------------------------------------------------
DEPLOY_USER="${SUDO_USER:-root}"

echo -e "\n${GREEN}=============================================="
echo    "  Apni Kirana Store — VPS Setup"
echo -e "==============================================${NC}"
echo    "  Target user for docker group: ${DEPLOY_USER}"
echo    "  Date: $(date)"

# ---------------------------------------------------------------------------
# 1. System update
# ---------------------------------------------------------------------------
print_section "Updating system packages"
apt-get update -y
apt-get upgrade -y

# ---------------------------------------------------------------------------
# 2. Install essential tools
# ---------------------------------------------------------------------------
print_section "Installing essential packages (curl, git, ufw, fail2ban)"
apt-get install -y curl git ufw fail2ban

# ---------------------------------------------------------------------------
# 3. Install Docker Engine via official convenience script
# ---------------------------------------------------------------------------
print_section "Installing Docker Engine"
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# ---------------------------------------------------------------------------
# 4. Install Docker Compose plugin
# ---------------------------------------------------------------------------
print_section "Installing Docker Compose plugin"
apt-get install -y docker-compose-plugin

# Verify both are available
docker --version
docker compose version

# ---------------------------------------------------------------------------
# 5. Add invoking user to docker group
# ---------------------------------------------------------------------------
print_section "Adding '${DEPLOY_USER}' to the docker group"
usermod -aG docker "${DEPLOY_USER}"
echo "    Note: The user must log out and back in for group changes to take effect."

# ---------------------------------------------------------------------------
# 6. Configure UFW firewall
# ---------------------------------------------------------------------------
print_section "Configuring UFW firewall"

ufw default deny incoming
ufw default allow outgoing

# Allow SSH — keep this BEFORE enabling UFW to avoid locking yourself out
ufw allow 22/tcp comment "SSH"

# Allow web traffic
ufw allow 80/tcp  comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# Enable UFW non-interactively
ufw --force enable

ufw status verbose

# ---------------------------------------------------------------------------
# 7. Configure fail2ban (protect SSH)
# ---------------------------------------------------------------------------
print_section "Configuring fail2ban"

# Copy the default config to a local override (upstream updates won't clobber it)
if [[ ! -f /etc/fail2ban/jail.local ]]; then
    cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
fi

# Enable the SSH jail in jail.local
# We use a Python-style ini approach: find [sshd] and ensure enabled = true
if grep -q '^\[sshd\]' /etc/fail2ban/jail.local; then
    # Replace or insert 'enabled = true' under [sshd]
    sed -i '/^\[sshd\]/,/^\[/{s/^enabled\s*=.*/enabled = true/}' /etc/fail2ban/jail.local
    # If 'enabled' line didn't exist under [sshd], insert it
    grep -A5 '^\[sshd\]' /etc/fail2ban/jail.local | grep -q 'enabled' || \
        sed -i '/^\[sshd\]/a enabled = true' /etc/fail2ban/jail.local
else
    # Append [sshd] jail block if it is completely missing
    cat >> /etc/fail2ban/jail.local <<'EOF'

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s
maxretry = 5
bantime  = 3600
EOF
fi

systemctl enable fail2ban
systemctl restart fail2ban
echo "    fail2ban status:"
fail2ban-client status || true

# ---------------------------------------------------------------------------
# 8. Automatic security updates
# ---------------------------------------------------------------------------
print_section "Enabling automatic security updates"
apt-get install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades <<< $'yes\n'
systemctl enable unattended-upgrades
systemctl start unattended-upgrades

# ---------------------------------------------------------------------------
# 9. Create application directory
# ---------------------------------------------------------------------------
APP_DIR="/opt/apni-kirana-store"
print_section "Creating application directory at ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"
echo "    Directory created and ownership set to ${DEPLOY_USER}."

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
echo -e "\n${GREEN}=============================================="
echo    "  Setup complete!"
echo -e "==============================================${NC}"
echo
echo "  Next steps:"
echo "  1. Log out and back in as '${DEPLOY_USER}' so the docker group takes effect."
echo "  2. Clone the repository into ${APP_DIR}:"
echo "       git clone <your-repo-url> ${APP_DIR}"
echo "  3. Copy your .env.prod file into ${APP_DIR}."
echo "  4. Initialise SSL certificates (run once):"
echo "       cd ${APP_DIR} && bash scripts/init-ssl.sh api.yourdomain.com admin.yourdomain.com you@example.com"
echo "  5. Start all services:"
echo "       docker compose -f docker-compose.prod.yml up -d"
echo "  6. For future deployments use:"
echo "       bash scripts/deploy.sh"
echo
