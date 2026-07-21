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
meta_worker_service="storefront-meta-worker"
admin_service="$(service_name adminstration "$target_slot")"
worker_service="$(service_name admin-worker "$target_slot")"
storefront_service="$(service_name storefront "$target_slot")"
api_host_port="$(slot_api_host_port "$target_slot")"
release_images_file="$release_dir/$release_images_marker_name"

append_summary() {
  local line="${1:?summary line is required}"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY"
  fi
}

reset_legacy_storefront_cache() {
  local slot="${1:?target slot is required}"
  local service="${2:?storefront service is required}"
  local current_images_file="$current_link/$release_images_marker_name"
  local container_id=""
  local volume_name=""

  if [[ -f "$current_images_file" ]] && grep -qx 'BRIC_STOREFRONT_APP=storefront-new' "$current_images_file"; then
    return 0
  fi

  container_id="$(compose ps -a -q "$service" | head -n 1)"
  if [[ -n "$container_id" ]]; then
    volume_name="$(docker inspect --format '{{range .Mounts}}{{if and (eq .Type "volume") (or (eq .Destination "/app/storefront/.next/cache") (eq .Destination "/app/storefront-new/.next/cache"))}}{{.Name}}{{end}}{{end}}' "$container_id")"
  fi

  if [[ -z "$volume_name" ]]; then
    volume_name="$(docker volume ls \
      --filter 'label=com.docker.compose.project=bricadmin' \
      --filter "label=com.docker.compose.volume=storefront-cache-${slot}" \
      --quiet | head -n 1)"
  fi

  compose rm --stop --force "$service" >/dev/null 2>&1 || true

  if [[ -n "$volume_name" ]]; then
    case "$volume_name" in
      *_storefront-cache-"$slot") ;;
      *)
        echo "refusing to remove unexpected storefront cache volume: $volume_name" >&2
        return 1
        ;;
    esac
    docker volume rm "$volume_name" >/dev/null
  fi

  printf 'cleared legacy storefront cache for candidate slot %s\n' "$slot"
  append_summary "- Cleared the candidate ${slot} slot's legacy storefront cache before the storefront-new cutover"
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

apply_release_images "$target_slot" "$release_images_file"

compose up -d postgres redis

set -a
source "${BRIC_ENV_DIR:-/srv/bric/env}/storefront-api.env"
set +a

compose pull "$api_service"
compose up -d --force-recreate "$api_service"
assert_service_image "$api_service"
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
compose pull "$meta_worker_service"
compose up -d --force-recreate "$meta_worker_service"
assert_service_image "$meta_worker_service"

actual_static_pages="$BRIC_STOREFRONT_STATIC_PAGES"
printf 'storefront-new build generated %s prerendered routes; remaining catalog routes use ISR\n' "$actual_static_pages"
append_summary "- Storefront release surface: ${BRIC_STOREFRONT_APP}"
append_summary "- Prerendered routes: ${actual_static_pages} (remaining catalog routes use ISR)"

if (( actual_static_pages < 1 )); then
  echo "storefront-new build did not report any prerendered routes" >&2
  append_summary "- ❌ Storefront-new prerender sanity check failed"
  exit 1
fi

append_summary "- ✅ Storefront-new release identity, live catalog preflight, and prerender sanity check passed"

compose pull "$admin_service" "$storefront_service"
reset_legacy_storefront_cache "$target_slot" "$storefront_service"
compose up -d --force-recreate "$admin_service" "$storefront_service"
assert_service_image "$admin_service"
assert_service_image "$storefront_service"
bash "$script_dir/wait-for-health.sh" "$admin_service"
bash "$script_dir/wait-for-health.sh" "$storefront_service"

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

compose pull "$worker_service"
compose up -d --force-recreate "$worker_service"
assert_service_image "$worker_service"

set_current_release "$release_dir"
set_active_slot "$target_slot"
prune_old_releases
printf 'deployed slot %s\n' "$target_slot"
