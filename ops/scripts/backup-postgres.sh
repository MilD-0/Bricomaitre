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

compose_project="${COMPOSE_PROJECT_NAME:-bricadmin}"
mapfile -t postgres_containers < <(
  docker ps \
    --filter "label=com.docker.compose.project=$compose_project" \
    --filter 'label=com.docker.compose.service=postgres' \
    --format '{{.ID}}'
)
if ((${#postgres_containers[@]} != 1)); then
  echo "expected one running Postgres container in project $compose_project, found ${#postgres_containers[@]}" >&2
  exit 1
fi
postgres_container="${postgres_containers[0]}"
printf 'backing up project=%s service=postgres container=%s database=%s\n' \
  "$compose_project" "$postgres_container" "${POSTGRES_DB:-bricadmin}" >&2

docker exec "$postgres_container" \
  pg_dump -U "${POSTGRES_USER:-bricadmin}" "${POSTGRES_DB:-bricadmin}" \
  | gzip -9 >"$partial_file"

gzip -t "$partial_file"
mv -- "$partial_file" "$backup_file"
trap - EXIT

echo "postgres backup written to $backup_file"
