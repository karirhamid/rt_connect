#!/usr/bin/env bash
# ============================================================================
# RT Connect — Extract the local Caddy CA certificate.
# Distribute the resulting "rtconnect-ca.crt" to every client computer that
# needs to trust the LAN HTTPS site (no more "not secure" warnings).
# ============================================================================
set -e
cd "$(dirname "$0")"

OUT="rtconnect-ca.crt"

if ! docker compose ps --status running | grep -q rtconnect-proxy; then
    echo "[ERROR] The Caddy container is not running. Start it first: ./start.sh"
    exit 1
fi

echo "Extracting CA certificate from Caddy..."
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$OUT"

echo
echo "Saved: $OUT"
echo
echo "INSTALL ON CLIENT COMPUTERS"
echo "  Windows : double-click $OUT  →  Install Certificate"
echo "            → Local Machine → Trusted Root Certification Authorities"
echo "  macOS   : double-click $OUT  →  Keychain Access → System keychain"
echo "            → Set 'Always Trust' for SSL"
echo "  Linux   : sudo cp $OUT /usr/local/share/ca-certificates/rtconnect.crt"
echo "            && sudo update-ca-certificates"
echo "  Android : Settings → Security → Install certificate from storage"
echo
echo "After installing, restart the browser. The padlock turns green."
