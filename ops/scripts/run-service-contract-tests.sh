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
export POSTGRES_ADMIN_USER='bricomaitre_admin_contract'
export POSTGRES_STOREFRONT_USER='bricomaitre_storefront_contract'

# The service runner exports these container values before starting the child shell.
# shellcheck disable=SC2016
exec ops/scripts/run-with-ci-services.sh "$postgres_port" "$redis_port" "$database" \
  bash -euo pipefail -c '
    pnpm --filter @bric/admin db:migrate
    pnpm --filter @bric/admin db:verify
    ops/scripts/configure-postgres-autovacuum.sh "$BRIC_CI_POSTGRES_CONTAINER" "$BRIC_CI_POSTGRES_PORT"

    for password_suffix in first rotated; do
      docker exec -i \
        --env POSTGRES_USER="$POSTGRES_USER" \
        --env POSTGRES_DB="$POSTGRES_DB" \
        --env POSTGRES_PORT="$BRIC_CI_POSTGRES_PORT" \
        --env POSTGRES_ADMIN_USER="$POSTGRES_ADMIN_USER" \
        --env POSTGRES_ADMIN_PASSWORD="admin-$password_suffix-contract-password" \
        --env POSTGRES_STOREFRONT_USER="$POSTGRES_STOREFRONT_USER" \
        --env POSTGRES_STOREFRONT_PASSWORD="storefront-$password_suffix-contract-password" \
        "$BRIC_CI_POSTGRES_CONTAINER" bash -s < ops/docker/postgres/init-roles.sh
    done

    role_contract="$(
      docker exec \
        --env PGPASSWORD=storefront-rotated-contract-password \
        "$BRIC_CI_POSTGRES_CONTAINER" \
        psql --host 127.0.0.1 --port "$BRIC_CI_POSTGRES_PORT" \
          --username "$POSTGRES_STOREFRONT_USER" --dbname "$POSTGRES_DB" \
          --tuples-only --no-align \
          --command "SELECT has_table_privilege(current_user, '\''public.orders'\'', '\''INSERT'\''), has_table_privilege(current_user, '\''admin.ecotrack_service_fees'\'', '\''SELECT'\''), has_table_privilege(current_user, '\''admin.users'\'', '\''SELECT'\''), has_schema_privilege(current_user, '\''public'\'', '\''CREATE'\''), has_column_privilege(current_user, '\''public.products'\'', '\''view_count'\'', '\''UPDATE'\''), has_column_privilege(current_user, '\''public.products'\'', '\''price'\'', '\''UPDATE'\'');"
    )"
    if [[ "$role_contract" != "t|t|f|f|t|f" ]]; then
      echo "restricted Storefront database role contract failed: $role_contract" >&2
      exit 1
    fi

    pnpm --filter @bric/admin test:services
  '
