#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=blue-green.sh
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
admin_service="$(service_name admin "$target_slot")"
worker_service="$(service_name admin-worker "$target_slot")"
storefront_service="$(service_name storefront "$target_slot")"
api_host_port="$(slot_api_host_port "$target_slot")"
release_images_file="$release_dir/$release_images_marker_name"
migration_state_file="$release_dir/.bric-migrations.json"
original_current_release="$(release_link_target "$current_link")"
original_previous_release="$(release_link_target "$previous_link")"
deployment_committed=false
routing_changed=false

if [[ ! -f "$migration_state_file" ]]; then
  echo "release is missing migration state: $migration_state_file" >&2
  exit 1
fi

nginx_main_fallback="$release_dir/ops/nginx/nginx.conf"
if [[ -n "$original_current_release" ]]; then
  nginx_main_fallback="$original_current_release/ops/nginx/nginx.conf"
fi

cleanup_failed_deployment() {
  local status=$?
  local routing_restored=true
  trap - EXIT

  if [[ "$deployment_committed" != true ]]; then
    set +e
    echo "deployment failed; restoring the previously verified runtime state" >&2

    rollback_runtime_env_transaction
    rollback_nginx_main_config_transaction
    if [[ "$routing_changed" == true && -n "$previous_slot" ]]; then
      if ! render_release_nginx_config "$original_current_release" "$previous_slot" \
        || ! reload_nginx; then
        routing_restored=false
        echo "failed to restore previous Nginx routing; preserving the candidate services" >&2
      fi
    fi

    if [[ "$routing_restored" == true ]]; then
      remove_slot_release_services "$target_slot"
      rollback_image_state_transaction
    else
      # The running Nginx generation may still route to the candidate. Keep
      # both its containers and digest pins intact instead of causing an outage.
      commit_image_state_transaction
    fi

    if [[ "$routing_restored" == true && -f "$image_state_file" ]] \
      && grep -q '^BRIC_IMAGE_STOREFRONT_META_WORKER=' "$image_state_file"; then
      compose up -d --force-recreate "$meta_worker_service"
      assert_service_image "$meta_worker_service"
      bash "$script_dir/wait-for-health.sh" "$meta_worker_service"
    elif [[ "$routing_restored" == true ]]; then
      compose stop "$meta_worker_service"
    fi

    if [[ "$routing_restored" == true ]]; then
      restore_release_link "$current_link" "$original_current_release"
      restore_release_link "$previous_link" "$original_previous_release"
      set_active_slot "$current_slot"
    fi
  fi

  exit "$status"
}

trap cleanup_failed_deployment EXIT

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

begin_image_state_transaction
begin_nginx_main_config_transaction "$nginx_main_fallback"
apply_release_images "$target_slot" "$release_images_file"

printf 'reconciling persistent services serially\n'
compose up -d postgres
bash "$script_dir/wait-for-health.sh" postgres
postgres_container_id="$(compose ps -q postgres)"
if [[ -z "$postgres_container_id" ]]; then
  echo 'postgres container is unavailable for runtime-role provisioning' >&2
  exit 1
fi
docker exec "$postgres_container_id" /docker-entrypoint-initdb.d/10-bric-roles.sh
compose up -d redis
bash "$script_dir/wait-for-health.sh" redis

set -a
# shellcheck disable=SC1091
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

if [[ -n "$original_current_release" && "$original_current_release" != "$release_dir" ]]; then
  python3 "$script_dir/verify-migration-rollback-safety.py" \
    "$original_current_release" \
    "$release_dir"
fi

"$script_dir/run-admin-migrations.sh" "$target_slot"
# Migrations may create a newly allowlisted public table or sequence. Reconcile
# the restricted Storefront role again before any candidate worker starts.
docker exec "$postgres_container_id" /docker-entrypoint-initdb.d/10-bric-roles.sh

if [[ -n "$previous_slot" ]]; then
  previous_api_service="$(service_name storefront-api "$previous_slot")"
  previous_admin_service="$(service_name admin "$previous_slot")"
  previous_storefront_service="$(service_name storefront "$previous_slot")"
  previous_worker_service="$(service_name admin-worker "$previous_slot")"

  bash "$script_dir/wait-for-health.sh" "$previous_api_service"
  bash "$script_dir/wait-for-health.sh" "$previous_admin_service"
  bash "$script_dir/wait-for-health.sh" "$previous_storefront_service"
  bash "$script_dir/wait-for-health.sh" "$previous_worker_service"
  bash "$script_dir/smoke-check.sh"
  append_summary "- ✅ Previous slot ${previous_slot} remained rollback-compatible after migrations"
fi

append_summary "- Storefront release surface: ${BRIC_STOREFRONT_APP}"
append_summary "- ✅ Storefront release identity and live catalog preflight passed"

compose pull "$admin_service" "$storefront_service"
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

compose pull "$worker_service"
compose up -d --force-recreate "$worker_service"
assert_service_image "$worker_service"
if ! bash "$script_dir/wait-for-health.sh" "$worker_service"; then
  exit 1
fi

# Rebuild all persisted reporting views with the candidate schema and code
# before the release becomes visible. This keeps new fact tables and changed
# semantics from serving an empty or stale first response after cutover.
"$script_dir/refresh-release-reporting.sh" "$target_slot"

routing_changed=true
render_nginx_config "$target_slot"
stage_nginx_main_config

if compose ps -q nginx >/dev/null 2>&1 && [[ -n "$(compose ps -q nginx)" ]]; then
  ensure_nginx
  reload_nginx
else
  ensure_nginx
fi

if ! bash "$script_dir/smoke-check.sh"; then
  exit 1
fi

compose pull "$meta_worker_service"
compose up -d --force-recreate "$meta_worker_service"
assert_service_image "$meta_worker_service"
bash "$script_dir/wait-for-health.sh" "$meta_worker_service"

if [[ -n "$previous_slot" ]]; then
  previous_worker_service="$(service_name admin-worker "$previous_slot")"
  compose stop "$previous_worker_service" || true
fi

if [[ -n "$original_current_release" && "$original_current_release" != "$release_dir" ]]; then
  set_previous_release "$original_current_release"
fi
set_current_release "$release_dir"
set_active_slot "$target_slot"
commit_image_state_transaction
commit_nginx_main_config_transaction
commit_runtime_env_transaction
deployment_committed=true
if [[ -n "$previous_slot" ]]; then
  stop_slot_app_services "$previous_slot"
fi
remove_obsolete_compose_containers || echo 'warning: obsolete Compose containers require manual cleanup' >&2
prune_old_releases
printf 'deployed slot %s\n' "$target_slot"
