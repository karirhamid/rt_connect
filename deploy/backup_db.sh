#!/bin/bash
# ============================================================
# RT Connect — PostgreSQL backup script
# Run manually: sudo bash /opt/rtconnect/deploy/backup_db.sh
# Or schedule via cron:
#   0 2 * * * root bash /opt/rtconnect/deploy/backup_db.sh >> /opt/rtconnect/logs/backup.log 2>&1
# ============================================================
set -e

APP_DIR="/opt/rtconnect"
BACKUP_DIR="$APP_DIR/backups"
DB_NAME="rtzkconnect_db"
DB_USER="rtconnect"
ENV_FILE="$APP_DIR/backend/.env"
KEEP_DAYS=30

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Read DB password from .env
if [[ -f "$ENV_FILE" ]]; then
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
else
    error ".env not found at $ENV_FILE"
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

info "Backing up database '$DB_NAME' to $DUMP_FILE ..."
PGPASSWORD="$DB_PASSWORD" pg_dump -U "$DB_USER" -h localhost "$DB_NAME" | gzip > "$DUMP_FILE"
info "Backup complete: $(du -sh "$DUMP_FILE" | cut -f1)"

# Prune old backups
info "Removing backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete
REMAINING=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
info "$REMAINING backup file(s) retained"
