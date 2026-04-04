#!/usr/bin/env bash
set -euo pipefail

compose_file="${COMPOSE_FILE:-ops/docker/compose.prod.yml}"

docker compose -f "$compose_file" run --rm admin-worker pnpm --filter adminstration db:verify
docker compose -f "$compose_file" run --rm admin-worker pnpm --filter adminstration db:migrate
