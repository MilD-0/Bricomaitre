#!/usr/bin/env bash
set -euo pipefail

workspace_filter="${1:-}"
if [[ -z "$workspace_filter" ]]; then
  echo 'usage: install-playwright-chromium.sh <pnpm-workspace-filter>' >&2
  exit 64
fi

playwright_cache_dir="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"
mkdir -p "$playwright_cache_dir"

exec 9>"$playwright_cache_dir/.install.lock"
flock 9
PLAYWRIGHT_BROWSERS_PATH="$playwright_cache_dir" \
  pnpm --filter "$workspace_filter" exec playwright install --with-deps chromium
