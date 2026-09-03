#!/usr/bin/env bash
set -euo pipefail

if (( $# > 3 )); then
  echo 'usage: run-service-contract-tests.sh [postgres-port] [redis-port] [database]' >&2
  exit 64
fi

postgres_port="${1:-55432}"
redis_port="${2:-56379}"
database="${3:-bricomaitre_test}"
workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

cd "$workspace_dir"

export DATABASE_URL="postgres://bricomaitre:bricomaitre@127.0.0.1:${postgres_port}/${database}"
export REDIS_URL="redis://127.0.0.1:${redis_port}/0"
export POSTGRES_USER='bricomaitre'
export POSTGRES_DB="$database"

# The service runner exports these container values before starting the child shell.
# shellcheck disable=SC2016
exec ops/scripts/run-with-ci-services.sh "$postgres_port" "$redis_port" "$database" \
  bash -lc 'pnpm --filter @bric/admin db:migrate && pnpm --filter @bric/admin db:verify && ops/scripts/configure-postgres-autovacuum.sh "$BRIC_CI_POSTGRES_CONTAINER" "$BRIC_CI_POSTGRES_PORT" && pnpm --filter @bric/admin test:services'
