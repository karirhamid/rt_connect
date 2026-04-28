#!/bin/bash
# ============================================================
# RT Connect — PostgreSQL restore script
# Usage: sudo bash restore_db.sh /path/to/backup.sql.gz
# ============================================================
set -e

APP_DIR="/opt/rtconnect"
DB_NAME="rtzkconnect_db"
DB_USER="rtconnect"
ENV_FILE="$APP_DIR/backend/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

DUMP_FILE="${1:-}"
[[ -z "$DUMP_FILE" ]] && error "Usage: sudo bash restore_db.sh /path/to/backup.sql.gz"
[[ ! -f "$DUMP_FILE" ]] && error "File not found: $DUMP_FILE"

# Read DB password from .env
if [[ -f "$ENV_FILE" ]]; then
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
else
    error ".env not found at $ENV_FILE"
fi

warn "This will DROP and recreate the database '$DB_NAME'."
read -p "Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" != "yes" ]] && error "Aborted"

info "Stopping API service..."
systemctl stop rtconnect-api || true

info "Dropping and recreating database..."
sudo -u postgres psql <<EOF
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

info "Restoring from $DUMP_FILE ..."
if [[ "$DUMP_FILE" == *.gz ]]; then
    gunzip -c "$DUMP_FILE" | PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h localhost "$DB_NAME"
else
    PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h localhost "$DB_NAME" -f "$DUMP_FILE"
fi

info "Restore complete — starting API service..."
systemctl start rtconnect-api
info "Done. Check: journalctl -u rtconnect-api -n 30"
