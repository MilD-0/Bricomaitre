#!/usr/bin/env bash
set -euo pipefail
umask 077

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${BACKUP_DIR:-/srv/bric/backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_file="$backup_dir/postgres-$timestamp.sql.gz"
partial_file="$backup_file.partial"

cleanup_partial_backup() {
  local status=$?
  trap - EXIT
  rm -f -- "$partial_file"
  exit "$status"
}

trap cleanup_partial_backup EXIT

postgres_container="$(docker ps --filter name=postgres --format '{{.ID}}' | head -n1)"
if [[ -z "$postgres_container" ]]; then
  echo 'no running Postgres container found' >&2
  exit 1
fi

docker exec "$postgres_container" \
  pg_dump -U "${POSTGRES_USER:-bricadmin}" "${POSTGRES_DB:-bricadmin}" \
  | gzip -9 >"$partial_file"

gzip -t "$partial_file"
mv -- "$partial_file" "$backup_file"
trap - EXIT

echo "postgres backup written to $backup_file"
