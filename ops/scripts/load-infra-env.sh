#!/usr/bin/env bash
set -euo pipefail

default_infra_env="/srv/bric/env/infra.env"
infra_env_file="${BRIC_INFRA_ENV_FILE:-$default_infra_env}"

if [[ ! -f "$infra_env_file" ]]; then
  return 0 2>/dev/null || exit 0
fi

set -a
# shellcheck disable=SC1090
source "$infra_env_file"
set +a
