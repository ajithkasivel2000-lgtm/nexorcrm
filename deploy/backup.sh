#!/usr/bin/env bash
# Nightly backup of NexorCRM: the database and uploaded files.
#
#   sudo mkdir -p /var/backups/nexorcrm
#   crontab -e    →   15 2 * * * /var/www/nexorcrm/deploy/backup.sh >> /var/log/nexorcrm-backup.log 2>&1
#
# Keeps KEEP_DAYS days (default 14). Copy /var/backups/nexorcrm off the server
# too (rclone, rsync, S3) — a backup on the same disk dies with the disk.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexorcrm}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nexorcrm}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

# DATABASE_URL from the app's own .env, without the ?schema= part pg_dump rejects.
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
if [ -z "$DB_URL" ]; then echo "DATABASE_URL not found in $APP_DIR/backend/.env" >&2; exit 1; fi

mkdir -p "$BACKUP_DIR"
pg_dump --dbname="$DB_URL" -Fc -f "$BACKUP_DIR/db_$STAMP.dump"
if [ -d "$APP_DIR/backend/uploads" ]; then
  tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$APP_DIR/backend" uploads
fi

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: db_$STAMP.dump"

# Restore (into an empty database):
#   pg_restore --no-owner -d "$DB_URL" /var/backups/nexorcrm/db_<stamp>.dump
#   tar -xzf /var/backups/nexorcrm/uploads_<stamp>.tar.gz -C /var/www/nexorcrm/backend
