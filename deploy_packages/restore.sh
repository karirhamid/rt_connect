#!/usr/bin/env bash
# ============================================================================
# RT Connect — Restore PostgreSQL from a backup file
# Usage: ./restore.sh backups/rtzkconnect_db_20260501_140000.sql.gz
# ============================================================================
set -e
cd "$(dirname "$0")"
source .env

DUMP="${1:-}"
[[ -z "$DUMP"  ]] && { echo "Usage: $0 path/to/backup.sql.gz"; exit 1; }
[[ ! -f "$DUMP" ]] && { echo "[ERROR] file not found: $DUMP"; exit 1; }

echo "This will REPLACE the current database '$DB_NAME'."
read -p "Type 'yes' to continue: " CONFIRM
[[ "$CONFIRM" != "yes" ]] && { echo "Aborted."; exit 0; }

echo "Dropping and recreating database..."
docker compose exec -T postgres psql -U "$DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" \
    -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "Restoring from $DUMP ..."
if [[ "$DUMP" == *.gz ]]; then
    gunzip -c "$DUMP" | docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"
else
    cat "$DUMP" | docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"
fi

echo "Restarting backend..."
docker compose restart backend
echo "Done."
