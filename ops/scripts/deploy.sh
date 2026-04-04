#!/usr/bin/env bash
set -euo pipefail

compose_file="${COMPOSE_FILE:-ops/docker/compose.prod.yml}"

docker compose -f "$compose_file" up -d postgres redis
docker compose -f "$compose_file" up -d --build storefront-api

bash ops/scripts/wait-for-health.sh storefront-api

bash ops/scripts/run-admin-migrations.sh

docker compose -f "$compose_file" up -d --build adminstration admin-worker storefront nginx

bash ops/scripts/smoke-check.sh
