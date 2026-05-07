#!/usr/bin/env bash
# =============================================================================
# expo-fresh.sh — Wipe Metro/Expo cache + start the chosen mobile app fresh.
#
# Usage:
#   bash scripts/expo-fresh.sh customer
#   bash scripts/expo-fresh.sh store-portal
#   bash scripts/expo-fresh.sh driver
#
# What it does:
#   1. Detects the laptop's LAN IP (so the phone can reach the API)
#   2. Wipes Metro / Expo / Watchman caches inside that app folder
#   3. Starts `expo start --lan --clear` with EXPO_PUBLIC_API_URL preset
#
# Default ports — adjust here if you change them:
#   customer     → 8081
#   store-portal → 8082
#   driver       → 8083
# =============================================================================

set -euo pipefail

APP="${1:-}"
case "$APP" in
  customer)     PORT=8081 ;;
  store-portal) PORT=8082 ;;
  driver)       PORT=8083 ;;
  *)
    cat <<EOF
Usage: bash scripts/expo-fresh.sh <app>
  app: customer | store-portal | driver
EOF
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/$APP"

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ App folder not found: $APP_DIR"
  exit 1
fi

# 1) Find LAN IP (macOS first, then Linux fallback)
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
if [[ -z "${LAN_IP:-}" ]]; then
  echo "❌ Couldn't detect LAN IP. Set it manually:"
  echo "    EXPO_PUBLIC_API_URL=http://<your-ip>:3001 npx expo start --port $PORT --lan --clear"
  exit 1
fi
API_URL="http://$LAN_IP:3001"

# 2) Wipe caches
echo "🧹 Wiping caches in $APP_DIR …"
cd "$APP_DIR"
rm -rf node_modules/.cache .expo .metro-cache 2>/dev/null || true

# Optional: tell watchman to forget this tree (fixes "Recrawled this watch …")
if command -v watchman >/dev/null 2>&1; then
  watchman watch-del "$REPO_ROOT" >/dev/null 2>&1 || true
  watchman watch-project "$REPO_ROOT" >/dev/null 2>&1 || true
fi

# 3) Start with fresh bundler
echo "🚀 Starting $APP on port $PORT pointed at $API_URL"
echo "    (Phone must be on the same Wi-Fi as this laptop)"
echo
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start --port "$PORT" --lan --clear
