#!/usr/bin/env bash
# ============================================================================
# RT Connect — one-command update from GitHub
#
# Runs: git pull → build.sh (refresh source) → docker compose up -d --build
# Use this instead of remembering the individual steps. Skipping ./build.sh
# is the #1 cause of "I deployed the fix but it doesn't show up" — this
# wrapper makes it impossible to forget.
#
# Usage:   sudo bash update.sh
#          or just:  ./update.sh
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$HERE")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${GREEN}${BOLD}━━ $* ━━${NC}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ -d "$REPO_ROOT/.git" ]] || die "Not in a git checkout: $REPO_ROOT"

step "1. Fetching latest code"
git -C "$REPO_ROOT" pull --ff-only

step "2. Refreshing build contexts (build.sh)"
cd "$HERE"
bash ./build.sh

step "3. Building images + recreating containers"
docker compose up -d --build

step "4. Waiting for services to settle"
sleep 8
docker compose ps

step "5. Recent backend log (last 25 lines)"
docker compose logs --tail 25 backend || true

echo
echo -e "${GREEN}${BOLD}✓ Update complete.${NC}"
echo "  Hard-refresh the browser (Ctrl+Shift+R) to bust any cached JS."
