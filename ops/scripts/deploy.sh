#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

source "$script_dir/blue-green.sh"

release_dir_input="${1:-$repo_root}"
expected_commit="${2:-}"
release_dir="$(cd "$release_dir_input" && pwd -P)"

verify_release_dir "$release_dir" "$expected_commit"
cd "$release_dir"

acquire_deploy_lock
ensure_runtime_dirs
validate_current_release_link

current_slot="$(get_active_slot)"
previous_slot=""
target_slot="$(get_inactive_slot "$current_slot")"

if ! slot_stack_present "$current_slot"; then
  target_slot="$current_slot"
else
  previous_slot="$current_slot"
fi

api_service="$(service_name storefront-api "$target_slot")"
admin_service="$(service_name adminstration "$target_slot")"
worker_service="$(service_name admin-worker "$target_slot")"
storefront_service="$(service_name storefront "$target_slot")"
storefront_old_service="$(service_name storefront-old "$target_slot")"
api_host_port="$(slot_api_host_port "$target_slot")"
storefront_build_log="$runtime_dir/storefront-build-${RELEASE_ID:-$target_slot}.log"
storefront_static_pages_baseline_file="$runtime_dir/storefront-static-pages.env"
storefront_static_pages_tolerance=2000

append_summary() {
  local line="${1:?summary line is required}"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY"
  fi
}

capture_storefront_build_inputs() {
  local base_url="${1:?base url is required}"
  local deploy_token="${2:-}"

  if [[ -z "$deploy_token" ]]; then
    echo "STOREFRONT_API_DEPLOY_TOKEN is required for storefront build preflight" >&2
    return 1
  fi

  python3 - "$base_url" "$deploy_token" <<'PY'
import json
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
deploy_token = sys.argv[2]
request = urllib.request.Request(
    f"{base_url}/api/internal/catalog-counts",
    headers={"x-deploy-token": deploy_token},
)

with urllib.request.urlopen(request, timeout=10) as response:
    counts = json.load(response)

required_counts = ["productCount", "brandCount", "categoryCount"]
for key in required_counts:
    if not isinstance(counts.get(key), int):
        raise SystemExit(f"/api/internal/catalog-counts did not return integer {key}")

if counts["productCount"] <= 0:
    raise SystemExit("storefront-api returned zero products for the build preflight")

print(f'PRODUCT_COUNT={counts["productCount"]}')
print(f'BRAND_COUNT={counts["brandCount"]}')
print(f'CATEGORY_COUNT={counts["categoryCount"]}')
PY
}

extract_static_page_count() {
  local build_log="${1:?build log path is required}"

  python3 - "$build_log" <<'PY'
import re
import sys

build_log = sys.argv[1]
with open(build_log, "r", encoding="utf-8", errors="ignore") as handle:
    content = handle.read()

matches = re.findall(r'Generating static pages using \d+ workers \((\d+)/(\d+)\)', content)
if not matches:
    raise SystemExit(1)

generated, total = matches[-1]
if generated != total:
    raise SystemExit(1)

print(generated)
PY
}

compute_storefront_expected_static_pages() {
  local product_count="${1:?product count is required}"
  local brand_count="${2:?brand count is required}"
  local category_count="${3:?category count is required}"

  python3 - "$product_count" "$brand_count" "$category_count" <<'PY'
import sys

product_count = int(sys.argv[1])
brand_count = int(sys.argv[2])
category_count = int(sys.argv[3])

locale_count = 2
root_fixed_pages = 11
localized_fixed_pages = 6 * locale_count
catalog_pages_per_namespace = product_count + brand_count + category_count
expected = root_fixed_pages + localized_fixed_pages + ((1 + locale_count) * catalog_pages_per_namespace)

print(expected)
PY
}

read_storefront_static_pages_baseline() {
  local baseline_file="${1:?baseline file path is required}"

  if [[ ! -f "$baseline_file" ]]; then
    return 1
  fi

  python3 - "$baseline_file" <<'PY'
import re
import sys

baseline_file = sys.argv[1]
with open(baseline_file, "r", encoding="utf-8") as handle:
    content = handle.read()

match = re.search(r'^STOREFRONT_STATIC_PAGES_BASELINE=(\d+)$', content, re.M)
if not match:
    raise SystemExit(1)

print(match.group(1))
PY
}

write_storefront_static_pages_baseline() {
  local baseline_file="${1:?baseline file path is required}"
  local actual_static_pages="${2:?actual static pages are required}"

  printf 'STOREFRONT_STATIC_PAGES_BASELINE=%s\n' "$actual_static_pages" >"$baseline_file"
}

compose up -d postgres redis

set -a
# The admin and storefront builds execute app code that reads runtime env during Next.js compilation.
# Load the app env files before the final build step so compose can pass the required values as build args.
source "${BRIC_ENV_DIR:-/srv/bric/env}/storefront-api.env"
source "${BRIC_ENV_DIR:-/srv/bric/env}/admin.env"
source "${BRIC_ENV_DIR:-/srv/bric/env}/storefront.env"
set +a

compose up -d --build "$api_service"
bash "$script_dir/wait-for-health.sh" "$api_service"

build_inputs="$(
  capture_storefront_build_inputs \
    "http://127.0.0.1:${api_host_port}" \
    "${STOREFRONT_API_DEPLOY_TOKEN:-}"
)" || {
  echo "storefront build preflight failed" >&2
  exit 1
}

eval "$build_inputs"

printf 'storefront build input counts: products=%s brands=%s categories=%s\n' \
  "$PRODUCT_COUNT" \
  "$BRAND_COUNT" \
  "$CATEGORY_COUNT"
append_summary "## Storefront build"
append_summary "- Upstream counts: ${PRODUCT_COUNT} products, ${BRAND_COUNT} brands, ${CATEGORY_COUNT} categories"

"$script_dir/run-admin-migrations.sh" "$target_slot"

compose build --progress plain "$admin_service"
compose build --progress plain "$storefront_service" 2>&1 | tee "$storefront_build_log"
compose build --progress plain "$storefront_old_service"

actual_static_pages="$(extract_static_page_count "$storefront_build_log")"
printf 'storefront build generated %s static pages\n' "$actual_static_pages"
append_summary "- Static pages generated: ${actual_static_pages}"

expected_static_pages="$(compute_storefront_expected_static_pages "$PRODUCT_COUNT" "$BRAND_COUNT" "$CATEGORY_COUNT")"
minimum_static_pages="$(( expected_static_pages - storefront_static_pages_tolerance ))"
if (( minimum_static_pages < 1 )); then
  minimum_static_pages=1
fi

printf 'storefront expected approximately %s static pages; enforcing floor %s (tolerance %s)\n' \
  "$expected_static_pages" \
  "$minimum_static_pages" \
  "$storefront_static_pages_tolerance"
append_summary "- Expected static pages from live catalog: ${expected_static_pages}"
append_summary "- Enforced minimum after tolerance: ${minimum_static_pages}"

baseline_static_pages=""
if baseline_static_pages="$(read_storefront_static_pages_baseline "$storefront_static_pages_baseline_file")"; then
  printf 'previous storefront static-page baseline is %s pages\n' "$baseline_static_pages"
  append_summary "- Previous successful static-page count: ${baseline_static_pages}"
else
  echo "storefront static-page baseline not found; continuing with live-catalog validation"
  append_summary "- ℹ️ Previous static-page baseline not found; using live-catalog validation only"
fi

if (( actual_static_pages < minimum_static_pages )); then
  echo "storefront static-page count regressed versus live catalog: got ${actual_static_pages}, expected at least ${minimum_static_pages} (from ${PRODUCT_COUNT} products, ${BRAND_COUNT} brands, ${CATEGORY_COUNT} categories)" >&2
  append_summary "- ❌ Static page count regressed versus live catalog: ${actual_static_pages} < ${minimum_static_pages}"
  exit 1
fi

append_summary "- ✅ Static page count passed live-catalog validation (${actual_static_pages} >= ${minimum_static_pages})"

compose up -d "$admin_service" "$storefront_service" "$storefront_old_service"
bash "$script_dir/wait-for-health.sh" "$admin_service"
bash "$script_dir/wait-for-health.sh" "$storefront_service"
bash "$script_dir/wait-for-health.sh" "$storefront_old_service"

if meta_verify_output="$(bash "$script_dir/verify-storefront-meta.sh" "$target_slot" 2>&1)"; then
  printf '%s\n' "$meta_verify_output"
  append_summary "- ✅ Candidate slot ${target_slot} passed Meta CAPI verification"
else
  printf '%s\n' "$meta_verify_output" >&2
  append_summary "- ❌ Candidate slot ${target_slot} failed Meta CAPI verification"
  exit 1
fi

render_nginx_config "$target_slot"

if compose ps -q nginx >/dev/null 2>&1 && [[ -n "$(compose ps -q nginx)" ]]; then
  ensure_nginx
  reload_nginx
else
  ensure_nginx
fi

if ! bash "$script_dir/smoke-check.sh"; then
  if [[ -n "$previous_slot" ]]; then
    render_nginx_config "$previous_slot"
    reload_nginx
  fi
  exit 1
fi

if [[ -n "$previous_slot" ]]; then
  previous_worker_service="$(service_name admin-worker "$previous_slot")"
  compose stop "$previous_worker_service" || true
fi

compose up -d --build "$worker_service"

write_storefront_static_pages_baseline "$storefront_static_pages_baseline_file" "$actual_static_pages"
append_summary "- Baseline stored: ${actual_static_pages}"

set_current_release "$release_dir"
set_active_slot "$target_slot"
prune_old_releases
printf 'deployed slot %s\n' "$target_slot"
