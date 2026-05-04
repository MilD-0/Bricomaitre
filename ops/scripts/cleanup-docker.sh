#!/usr/bin/env bash
set -euo pipefail

runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
lock_file="${BRIC_DOCKER_CLEANUP_LOCK_FILE:-$runtime_dir/docker-cleanup.lock}"
build_cache_until="${BRIC_DOCKER_CLEANUP_BUILD_CACHE_UNTIL:-24h}"
image_until="${BRIC_DOCKER_CLEANUP_IMAGE_UNTIL:-168h}"

mkdir -p "$runtime_dir"
exec 9>"$lock_file"

if ! flock -n 9; then
  echo "another Docker cleanup is already running"
  exit 0
fi

echo "Docker cleanup started at $(date -Is)"
echo "Disk before cleanup:"
df -h /
echo
echo "Docker usage before cleanup:"
docker system df
echo

echo "Pruning Docker build cache older than ${build_cache_until}"
docker builder prune -af --filter "until=${build_cache_until}"
echo

echo "Pruning unused Docker images older than ${image_until}"
docker image prune -af --filter "until=${image_until}"
echo

echo "Disk after cleanup:"
df -h /
echo
echo "Docker usage after cleanup:"
docker system df
echo "Docker cleanup finished at $(date -Is)"
