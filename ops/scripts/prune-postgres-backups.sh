#!/usr/bin/env bash
set -euo pipefail

backup_dir="${BACKUP_DIR:-/srv/bric/backups}"
local_keep_days="${BACKUP_LOCAL_KEEP_DAYS:-14}"

if [[ ! "$local_keep_days" =~ ^[1-9][0-9]*$ ]]; then
  echo 'BACKUP_LOCAL_KEEP_DAYS must be a positive integer' >&2
  exit 1
fi

if [[ ! -d "$backup_dir" ]]; then
  echo "backup directory does not exist: $backup_dir" >&2
  exit 1
fi

deleted_count=0
while IFS= read -r -d '' backup_file; do
  rm -- "$backup_file"
  deleted_count=$((deleted_count + 1))
done < <(
  find "$backup_dir" -maxdepth 1 -type f -name 'postgres-*.sql.gz' \
    -mtime "+$local_keep_days" -print0
)

echo "pruned $deleted_count local postgres backup(s) older than $local_keep_days day(s)"
