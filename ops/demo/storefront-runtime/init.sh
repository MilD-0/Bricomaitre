#!/bin/sh
set -eu
source_dir=/app/apps/storefront/.next/server
target=/next-server
if [ "${1:-}" != reset ] && cmp -s /app/apps/storefront/.next/BUILD_ID "$target/.build-id"; then
  exit 0
fi
# Only generated demo runtime files live in this dedicated volume.
find "$target" -mindepth 1 -delete
cp -a "$source_dir/." "$target/"
cp /app/apps/storefront/.next/BUILD_ID "$target/.build-id"
chown 10001:10001 "$target" "$target/.build-id"
