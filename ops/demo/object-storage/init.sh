#!/bin/sh
set -eu

alias_name=demo
bucket=bricomaitre-demo

mc alias set "$alias_name" http://object-storage:9000 "$DEMO_S3_ACCESS_KEY" "$DEMO_S3_SECRET_KEY" >/dev/null

if [ "${1:-}" = reset ]; then
  # Uploaded demo files must not accumulate across resets. Catalog originals
  # and curated merchandising are restored separately from the local cache.
  for prefix in products brands categories assets banners bulletin exports; do
    mc rm --recursive --force "$alias_name/$bucket/$prefix/" >/dev/null 2>&1 || true
  done
fi

mc mb --ignore-existing "$alias_name/$bucket" >/dev/null
mc admin user add "$alias_name" "$DEMO_S3_ADMIN_ACCESS_KEY" "$DEMO_S3_ADMIN_SECRET_KEY" >/dev/null
mc admin user add "$alias_name" "$DEMO_S3_READER_ACCESS_KEY" "$DEMO_S3_READER_SECRET_KEY" >/dev/null
mc admin policy create "$alias_name" demo-application /admin-policy.json >/dev/null
mc admin policy create "$alias_name" demo-reader /reader-policy.json >/dev/null
mc admin policy attach "$alias_name" demo-application --user "$DEMO_S3_ADMIN_ACCESS_KEY" >/dev/null
mc admin policy attach "$alias_name" demo-reader --user "$DEMO_S3_READER_ACCESS_KEY" >/dev/null
mc quota set "$alias_name/$bucket" --size 4GiB >/dev/null
mc anonymous set-json /public-read-policy.json "$alias_name/$bucket" >/dev/null
mc mirror --overwrite --remove /catalog-images "$alias_name/$bucket/catalog" >/dev/null
mc mirror --overwrite --remove /merchandising-assets "$alias_name/$bucket/merchandising" >/dev/null
for prefix in products brands categories assets banners bulletin exports; do
  mc ilm rule add --expire-days 2 --prefix "$prefix/" "$alias_name/$bucket" >/dev/null 2>&1 || true
done

printf 'Demo object storage initialized.\n'
