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

compose pull "$service"
for task in verify migrate verify; do
  ADMIN_DB_TASK="$task" compose run --rm --no-deps "$service"
done
"$script_dir/configure-postgres-autovacuum.sh"
