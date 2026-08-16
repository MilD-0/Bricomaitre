#!/usr/bin/env bash
set -euo pipefail
umask 077

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${BACKUP_DIR:-/srv/bric/backups}"
mkdir -p -m 700 "$backup_dir"
chmod 700 "$backup_dir"
backup_file="$backup_dir/postgres-$timestamp.sql.gz"

docker exec "$(docker ps --filter name=postgres --format '{{.ID}}' | head -n1)" \
  pg_dump -U "${POSTGRES_USER:-bricadmin}" "${POSTGRES_DB:-bricadmin}" \
  | gzip -9 >"$backup_file"

echo "postgres backup written to $backup_file"
