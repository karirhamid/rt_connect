#!/usr/bin/env bash
# ============================================================================
# RT Connect — PostgreSQL backup (gzipped) into ./backups/
# Add to cron for nightly backups:
#   0 2 * * * cd /path/to/deploy_packages && ./backup.sh >> backups/backup.log 2>&1
# ============================================================================
set -e
cd "$(dirname "$0")"

source .env

mkdir -p backups
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="backups/${DB_NAME}_${STAMP}.sql.gz"

echo "Backing up $DB_NAME -> $OUT"
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# Prune old backups
find backups -name "*.sql.gz" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "Done: $(du -h "$OUT" | cut -f1) — $OUT"
