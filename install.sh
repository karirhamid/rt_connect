#!/usr/bin/env bash
# ============================================================================
# RT Connect — One-shot Ubuntu installer
#
# Usage (as root or via sudo):
#   curl -fsSL https://raw.githubusercontent.com/karirhamid/rt_connect/main/install.sh | sudo bash
#
# What it does:
#   1.  Pre-flight checks (Ubuntu version, RAM, disk, network)
#   2.  Waits / cleans up any stuck apt processes
#   3.  Installs Docker Engine + Compose plugin (skips if already present)
#   4.  Clones / updates the repo into /opt/rt_connect
#   5.  Auto-detects the server IP (user confirms)
#   6.  Generates a 32-char random DB password
#   7.  Writes .env with chmod 600
#   8.  Brings up the stack in order, waiting for each service to be healthy
#   9.  Smoke-tests the deployment
#   10. Prints a one-time summary with credentials (also saved to
#       /root/INSTALL_SUMMARY.txt with chmod 600)
#   11. Schedules nightly DB backups via cron
#
# Re-runs are safe: existing .env is preserved, existing repo is git-pulled,
# existing containers are recreated only on image change.
# ============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "\n${BLUE}${BOLD}━━ $* ━━${NC}\n"; }
die()   { error "$*"; exit 1; }

# ── Constants ───────────────────────────────────────────────────────────────
REPO_URL="https://github.com/karirhamid/rt_connect.git"
INSTALL_DIR="/opt/rt_connect"
DEPLOY_DIR="$INSTALL_DIR/deploy_packages"
SUMMARY_FILE="/root/INSTALL_SUMMARY.txt"
MIN_RAM_KB=$((2 * 1024 * 1024))
MIN_DISK_KB=$((10 * 1024 * 1024))

# ── 0. Must be root ─────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run as root or via sudo:  curl -fsSL ... | sudo bash"

# ── 1. Pre-flight checks ────────────────────────────────────────────────────
step "Pre-flight checks"

if [[ ! -f /etc/os-release ]]; then
    die "/etc/os-release not found — not a supported Linux"
fi
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
    warn "Designed for Ubuntu; detected ID=$ID — will try anyway"
fi
info "OS: $PRETTY_NAME"

ram_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
[[ $ram_kb -lt $MIN_RAM_KB ]] && die "Not enough RAM (have ${ram_kb} KB, need >= ${MIN_RAM_KB} KB / 2 GB)"
info "RAM: $((ram_kb / 1024)) MB — OK"

disk_kb=$(df -k /opt 2>/dev/null | awk 'NR==2 {print $4}' || df -k / | awk 'NR==2 {print $4}')
[[ $disk_kb -lt $MIN_DISK_KB ]] && die "Not enough free disk (have ${disk_kb} KB free, need >= ${MIN_DISK_KB} KB / 10 GB)"
info "Free disk: $((disk_kb / 1024)) MB — OK"

if ! curl -fsS --max-time 8 https://github.com >/dev/null; then
    die "No internet access — needed to install Docker and clone the repo"
fi
info "Internet: OK"

# ── 2. APT lock handling ────────────────────────────────────────────────────
step "Waiting for any running apt processes"

wait_apt_lock() {
    local waited=0
    local max_wait=$((10 * 60))   # 10 minutes
    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
          || fuser /var/lib/dpkg/lock >/dev/null 2>&1 \
          || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
        if [[ $waited -ge $max_wait ]]; then
            warn "An apt process has held the lock for ${max_wait}s — possibly stuck."
            warn "If you see no apt activity in 'top', the safe fix is:"
            warn "  sudo kill -9 \$(sudo fuser /var/lib/dpkg/lock-frontend 2>/dev/null)"
            warn "  sudo rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock"
            warn "  sudo dpkg --configure -a"
            die "Aborting to avoid corrupting your apt state."
        fi
        printf "  apt lock held by another process; waited %ds...\r" "$waited"
        sleep 5
        waited=$((waited + 5))
    done
    echo "" # newline after \r progress
    info "apt is free"
}
wait_apt_lock

export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confdef" -y)

# ── 3. Base packages ────────────────────────────────────────────────────────
step "Installing base packages (curl, git, rsync, openssl, cron)"

apt-get update -qq
apt-get "${APT_OPTS[@]}" install -qq curl git rsync openssl cron jq ca-certificates >/dev/null
info "Base packages installed"

# ── 4. Docker ──────────────────────────────────────────────────────────────
step "Installing Docker (if missing)"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker $(docker --version | awk '{print $3}' | tr -d ',') + Compose plugin already installed"
else
    info "Pulling Docker official install script..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh >/dev/null
    rm -f /tmp/get-docker.sh
    info "Docker installed"
fi

systemctl enable --now docker >/dev/null 2>&1 || true
info "Docker service enabled and running"

# ── 5. Clone / update repo ──────────────────────────────────────────────────
step "Fetching application code into $INSTALL_DIR"

if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Existing checkout found — running git pull"
    git -C "$INSTALL_DIR" pull --ff-only
else
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
info "Repo at $(git -C "$INSTALL_DIR" log -1 --format='%h %s')"

[[ ! -d "$DEPLOY_DIR" ]] && die "$DEPLOY_DIR not found in repo — wrong branch?"

# ── 6. Populate Docker build contexts ──────────────────────────────────────
step "Refreshing build contexts"

chmod +x "$DEPLOY_DIR"/*.sh
bash "$DEPLOY_DIR/build.sh"

# ── 7. Detect IP & gather config ────────────────────────────────────────────
step "Configuring deployment"

mapfile -t IPS < <(ip -4 -o addr show scope global | awk '{split($4,a,"/"); print a[1]}')
if [[ ${#IPS[@]} -eq 0 ]]; then
    die "No non-loopback IPv4 address found on this server"
fi

echo "Detected IP addresses on this server:"
for i in "${!IPS[@]}"; do
    echo "    [$((i+1))] ${IPS[$i]}"
done

if [[ -t 0 ]]; then
    # Interactive
    read -rp "Pick the IP clients will use [1]: " choice
    choice=${choice:-1}
    SERVER_IP="${IPS[$((choice - 1))]:-${IPS[0]}}"
else
    # Non-interactive (piped from curl) — use first IP
    SERVER_IP="${IPS[0]}"
    warn "Non-interactive run — using first IP: $SERVER_IP"
    warn "  Override with:  RTCONNECT_SERVER_IP=x.x.x.x curl ... | sudo bash"
fi

# Allow override via env var (useful for piped non-interactive runs)
SERVER_IP="${RTCONNECT_SERVER_IP:-$SERVER_IP}"
info "SERVER_IP = $SERVER_IP"

TZ_VAL="${RTCONNECT_TZ:-$(timedatectl show -p Timezone --value 2>/dev/null || echo 'Africa/Casablanca')}"
info "Timezone  = $TZ_VAL"

# ── 8. Generate or preserve credentials ─────────────────────────────────────
step "Generating credentials"

ENV_FILE="$DEPLOY_DIR/.env"

if [[ -f "$ENV_FILE" ]] && grep -q "^DB_PASSWORD=" "$ENV_FILE"; then
    info "Existing .env found — keeping current DB_PASSWORD"
    DB_PASSWORD=$(grep "^DB_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
    CREDENTIAL_REUSED=1
else
    DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
    info "Generated a fresh 32-char DB_PASSWORD"
    CREDENTIAL_REUSED=0
fi

cat > "$ENV_FILE" <<EOF
# Auto-generated by install.sh on $(date -Iseconds)
# Do not share this file. Permissions: chmod 600, owner root.

SERVER_IP=$SERVER_IP
HTTP_PORT=80
HTTPS_PORT=443
ALLOWED_ORIGINS=https://$SERVER_IP,http://$SERVER_IP,https://localhost,http://localhost

DB_NAME=rtzkconnect_db
DB_USER=rtconnect
DB_PASSWORD=$DB_PASSWORD

APP_VERSION=2.2.1
TZ=$TZ_VAL

DEVICE_IP=127.0.0.1
DEVICE_PORT=4370
DEVICE_TIMEOUT=30
DEVICE_PASSWORD=0
EOF

chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
info ".env written with mode 600, owner root"

# Tight perms on the install dir too
chown -R root:root "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
[[ -d "$DEPLOY_DIR/backups" ]] || mkdir -p "$DEPLOY_DIR/backups"
chmod 700 "$DEPLOY_DIR/backups"
info "Permissions tightened on $INSTALL_DIR (chmod 750) and backups/ (chmod 700)"

# ── 9. Bring up the stack ───────────────────────────────────────────────────
step "Building and starting the stack (3-7 minutes the first time)"

cd "$DEPLOY_DIR"

wait_healthy() {
    local name="$1"
    local max=60
    local i=0
    while [[ $i -lt $max ]]; do
        local s
        s=$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null || echo missing)
        case "$s" in
            healthy) info "$name is healthy"; return 0 ;;
            missing) sleep 2 ;;
            *)        sleep 2 ;;
        esac
        i=$((i + 2))
    done
    error "$name did not become healthy within ${max}s — see: docker compose logs $name"
    return 1
}

info "Starting postgres..."
docker compose up -d postgres
wait_healthy rtconnect-db || die "postgres failed to start"

info "Building + starting backend..."
docker compose up -d --build backend
wait_healthy rtconnect-api || die "backend failed to start — check logs above"

info "Building + starting frontend + caddy..."
docker compose up -d --build frontend caddy
# Frontend health takes longer; give nginx a few extra seconds
sleep 8

# ── 10. Smoke test ──────────────────────────────────────────────────────────
step "Smoke-testing the deployment"

if ! curl -sfk --max-time 10 https://localhost/api/public/ping | grep -q '"ok":true'; then
    error "Smoke test failed — HTTPS ping did not return {\"ok\":true}"
    error "Last 30 log lines from each service:"
    docker compose logs --tail 30 backend caddy frontend
    die "Deployment is unhealthy. Fix the errors above and re-run this script."
fi
info "HTTPS smoke test passed"

# ── 11. UFW firewall (open 80/443 if active) ────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    info "ufw is active — opening 80/tcp and 443/tcp"
    ufw allow 80/tcp  >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw reload         >/dev/null
fi

# ── 12. Nightly backup cron job ─────────────────────────────────────────────
step "Scheduling nightly DB backup (02:00 server time)"

CRON_LINE="0 2 * * * root cd $DEPLOY_DIR && /usr/bin/env bash backup.sh >> backups/cron.log 2>&1"
CRON_FILE=/etc/cron.d/rtconnect-backup
echo "$CRON_LINE" > "$CRON_FILE"
chmod 644 "$CRON_FILE"
info "Cron job written: $CRON_FILE"

# ── 13. Summary & credentials ───────────────────────────────────────────────
step "Done"

cat > "$SUMMARY_FILE" <<EOF
================================================================================
RT Connect — Installation Summary
Installed on: $(date)
================================================================================

URL (browser):
    https://$SERVER_IP
    https://localhost   (from this server only)

Default web login (CHANGE IMMEDIATELY):
    user:     admin
    password: admin123

Database credentials (auto-generated, stored in $ENV_FILE chmod 600):
    DB_USER:     rtconnect
    DB_NAME:     rtzkconnect_db
    DB_PASSWORD: $DB_PASSWORD

Files:
    Install dir:  $INSTALL_DIR             (chmod 750, root)
    Deploy dir:   $DEPLOY_DIR
    .env file:    $ENV_FILE                (chmod 600, root)
    Backups:      $DEPLOY_DIR/backups/     (chmod 700, root)
    This file:    $SUMMARY_FILE            (chmod 600, root)

Operations cheat-sheet (run from $DEPLOY_DIR):
    Live logs:        docker compose logs -f --tail 200
    Stop everything:  docker compose down
    Start again:      docker compose up -d
    Restart one:      docker compose restart backend
    Backup now:       ./backup.sh
    Restore:          ./restore.sh backups/<file>.sql.gz
    Update:           cd $INSTALL_DIR && git pull && cd deploy_packages \\
                      && ./build.sh && docker compose up -d --build

To remove the browser cert warning permanently, run:
    cd $DEPLOY_DIR && ./extract-ca.sh
…then install the resulting rtconnect-ca.crt on each client computer
(double-click → Trusted Root Certification Authorities).
================================================================================
EOF
chmod 600 "$SUMMARY_FILE"
chown root:root "$SUMMARY_FILE"

echo ""
echo -e "${GREEN}${BOLD}┌───────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}${BOLD}│  RT Connect is installed and running.                         │${NC}"
echo -e "${GREEN}${BOLD}└───────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  Open your browser:   ${BOLD}https://$SERVER_IP${NC}"
echo -e "  First login:         ${BOLD}admin / admin123${NC}    (change immediately)"
echo ""

if [[ $CREDENTIAL_REUSED -eq 0 ]]; then
    echo -e "${RED}${BOLD}━━ Database password (shown ONCE — save it now) ━━${NC}"
    echo -e "${RED}${BOLD}    $DB_PASSWORD${NC}"
    echo ""
    echo -e "  A copy of this summary (including the password) is in:"
    echo -e "    ${BOLD}$SUMMARY_FILE${NC}    (readable only by root)"
    echo ""
    echo -e "  View it later with:   ${BOLD}sudo cat $SUMMARY_FILE${NC}"
    echo ""
fi

echo -e "  Full guides:"
echo -e "    $DEPLOY_DIR/INSTALL_GUIDE.md"
echo -e "    $DEPLOY_DIR/QUICKSTART.md"
echo ""
