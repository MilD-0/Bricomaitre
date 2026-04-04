#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${BACKUP_DIR:-/srv/bric/backups}"
mkdir -p "$backup_dir"

redis_container="$(docker ps --filter name=redis --format '{{.ID}}' | head -n1)"

docker exec "$redis_container" redis-cli SAVE >/dev/null
docker cp "$redis_container:/data/dump.rdb" "$backup_dir/redis-$timestamp.rdb"

echo "redis backup written to $backup_dir/redis-$timestamp.rdb"
