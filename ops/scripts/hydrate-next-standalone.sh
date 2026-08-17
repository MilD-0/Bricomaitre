#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"
app_dir_input="${1:?application directory is required}"

if [[ "$app_dir_input" == /* ]]; then
  app_dir="$app_dir_input"
else
  app_dir="$repo_root/$app_dir_input"
fi

standalone_modules="$app_dir/.next/standalone/node_modules/.pnpm"
helpers_source="${BRIC_SWC_HELPERS_SOURCE:-$repo_root/node_modules/.pnpm/node_modules/@swc/helpers}"

if [[ ! -d "$standalone_modules" ]]; then
  echo "Next standalone modules are missing: $standalone_modules" >&2
  exit 1
fi

if [[ ! -d "$helpers_source" ]]; then
  echo "complete @swc/helpers package is missing: $helpers_source" >&2
  exit 1
fi

mapfile -d '' helper_targets < <(
  find "$standalone_modules" -type d -path '*/node_modules/@swc/helpers' -print0
)

if (( ${#helper_targets[@]} == 0 )); then
  echo "Next standalone output did not contain an @swc/helpers target" >&2
  exit 1
fi

for helper_target in "${helper_targets[@]}"; do
  cp -LR "$helpers_source/." "$helper_target/"
  test -f "$helper_target/esm/_interop_require_default.js"
  test -f "$helper_target/esm/_interop_require_wildcard.js"
done

printf 'hydrated @swc/helpers in %s Next standalone target(s)\n' "${#helper_targets[@]}"
