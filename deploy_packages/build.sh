#!/usr/bin/env bash
# ============================================================================
# RT Connect — Refresh source from the parent project into the build contexts
# ============================================================================
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
BACKEND_SRC="$ROOT/backend-api"
FRONTEND_SRC="$ROOT/frontend"
BACKEND_DST="$HERE/backend"
FRONTEND_DST="$HERE/frontend"

echo "========================================"
echo "  RT Connect — Build context refresh"
echo "========================================"

[[ -d "$BACKEND_SRC"  ]] || { echo "[ERROR] $BACKEND_SRC not found";  exit 1; }
[[ -d "$FRONTEND_SRC" ]] || { echo "[ERROR] $FRONTEND_SRC not found"; exit 1; }

echo "[1/2] Copying backend source..."
# Wipe everything in the destination except Dockerfile / .dockerignore
find "$BACKEND_DST" -mindepth 1 -maxdepth 1 \
    ! -name 'Dockerfile' ! -name '.dockerignore' -exec rm -rf {} +
rsync -a --exclude='__pycache__' --exclude='*.pyc' --exclude='venv' \
    --exclude='.env' --exclude='*.log' --exclude='.pytest_cache' \
    "$BACKEND_SRC/" "$BACKEND_DST/"

echo "[2/2] Copying frontend source..."
find "$FRONTEND_DST" -mindepth 1 -maxdepth 1 \
    ! -name 'Dockerfile' ! -name '.dockerignore' ! -name 'nginx.conf' -exec rm -rf {} +
rsync -a --exclude='node_modules' --exclude='dist' \
    --exclude='.env' --exclude='.env.production' --exclude='*.log' \
    "$FRONTEND_SRC/" "$FRONTEND_DST/"

echo
echo "Build context refreshed. Now run: ./start.sh"
