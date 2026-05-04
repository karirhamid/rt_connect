#!/usr/bin/env bash
# ============================================================================
# RT Connect — Build and start all services
# Requires: Docker Engine and Docker Compose v2
# ============================================================================
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ ! -f .env ]]; then
    echo
    echo "[ERROR] .env not found in $HERE"
    echo
    echo "  cp .env.example .env"
    echo "  nano .env       # edit values"
    echo
    exit 1
fi

if ! docker version >/dev/null 2>&1; then
    echo "[ERROR] Docker is not running."
    exit 1
fi

echo
echo "========================================"
echo "  RT Connect — Starting services"
echo "========================================"
echo

docker compose up -d --build

echo
echo "========================================"
echo "  Stack is up"
echo "========================================"
echo
echo "  Logs        : ./logs.sh"
echo "  Stop        : ./stop.sh"
echo "  Backup DB   : ./backup.sh"
echo
SERVER_IP=$(grep -E '^SERVER_IP=' .env | cut -d= -f2 || echo 'localhost')
HTTP_PORT=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2 || echo '80')
echo "  Open: http://${SERVER_IP}:${HTTP_PORT}"
echo
