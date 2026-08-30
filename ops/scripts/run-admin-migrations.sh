#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=blue-green.sh
source "$script_dir/blue-green.sh"

slot="${1:-$(get_active_slot)}"
service="$(service_name admin-migrations "$slot")"

if [[ -f "${BRIC_ENV_DIR:-/srv/bric/env}/admin.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${BRIC_ENV_DIR:-/srv/bric/env}/admin.env"
  set +a
fi

run_migration_task() {
  local task="${1:?migration task is required}"

  compose pull "$service"
  ADMIN_DB_TASK="$task" compose run --rm --no-deps "$service"
}

run_migration_task verify
run_migration_task migrate
run_migration_task verify
"$script_dir/configure-postgres-autovacuum.sh"
