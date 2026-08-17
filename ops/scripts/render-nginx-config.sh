#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=blue-green.sh
source "$(dirname "$0")/blue-green.sh"

slot="${1:-$(get_active_slot)}"

render_nginx_config "$slot"
printf 'rendered nginx config for slot %s at %s\n' "$slot" "$nginx_conf_file"
