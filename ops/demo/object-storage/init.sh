#!/bin/sh
set -eu

alias_name=demo
bucket=bricomaitre-demo

mc alias set "$alias_name" http://object-storage:9000 "$DEMO_S3_ACCESS_KEY" "$DEMO_S3_SECRET_KEY" >/dev/null

if [ "${1:-}" = reset ]; then
  mc rm --recursive --force "$alias_name/$bucket/bulletin/" >/dev/null 2>&1 || true
  mc rm --recursive --force "$alias_name/$bucket/exports/orders/" >/dev/null 2>&1 || true
fi

mc mb --ignore-existing "$alias_name/$bucket" >/dev/null
mc anonymous set-json /public-read-policy.json "$alias_name/$bucket" >/dev/null
mc mirror --overwrite --remove /catalog-images "$alias_name/$bucket/catalog" >/dev/null
mc mirror --overwrite --remove /merchandising-assets "$alias_name/$bucket/merchandising" >/dev/null
mc ilm rule add --expire-days 2 --prefix bulletin/ "$alias_name/$bucket" >/dev/null 2>&1 || true
mc ilm rule add --expire-days 2 --prefix exports/orders/ "$alias_name/$bucket" >/dev/null 2>&1 || true

printf 'Demo object storage initialized.\n'
