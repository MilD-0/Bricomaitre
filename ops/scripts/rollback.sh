#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=blue-green.sh
source "$script_dir/blue-green.sh"

acquire_deploy_lock
ensure_runtime_dirs
validate_current_release_link

current_slot="$(get_active_slot)"
target_slot="$(get_inactive_slot "$current_slot")"
current_release="$(release_link_target "$current_link")"
target_release="$(release_link_target "$previous_link")"

if [[ -z "$current_release" || -z "$target_release" ]]; then
  echo "rollback requires both ${current_link} and ${previous_link} to identify verified releases" >&2
  exit 1
fi
if [[ "$current_release" == "$target_release" ]]; then
  echo "rollback target is identical to the current release: ${target_release}" >&2
  exit 1
fi

verify_release_dir "$target_release"
release_images_file="$target_release/$release_images_marker_name"

api_service="$(service_name storefront-api "$target_slot")"
admin_service="$(service_name admin "$target_slot")"
storefront_service="$(service_name storefront "$target_slot")"
worker_service="$(service_name admin-worker "$target_slot")"
current_worker_service="$(service_name admin-worker "$current_slot")"
meta_worker_service="storefront-meta-worker"
rollback_committed=false
routing_changed=false

cleanup_failed_rollback() {
  local status=$?
  local routing_restored=true
  trap - EXIT

  if [[ "$rollback_committed" != true ]]; then
    set +e
    echo "rollback failed; restoring the current verified release" >&2

    rollback_nginx_main_config_transaction
    if [[ "$routing_changed" == true ]]; then
      if ! render_release_nginx_config "$current_release" "$current_slot" \
        || ! reload_nginx; then
        routing_restored=false
        echo "failed to restore current Nginx routing; preserving the rollback candidate" >&2
      fi
    fi

    if [[ "$routing_restored" == true ]]; then
      remove_slot_release_services "$target_slot"
      rollback_image_state_transaction
      compose up -d --force-recreate "$meta_worker_service"
      assert_service_image "$meta_worker_service"
      bash "$script_dir/wait-for-health.sh" "$meta_worker_service"
      restore_release_link "$current_link" "$current_release"
      restore_release_link "$previous_link" "$target_release"
      set_active_slot "$current_slot"
    else
      commit_image_state_transaction
    fi
  fi

  exit "$status"
}

trap cleanup_failed_rollback EXIT

begin_image_state_transaction
begin_nginx_main_config_transaction "$current_release/ops/nginx/nginx.conf"
apply_release_images "$target_slot" "$release_images_file" "$verified_release_layout"

compose pull "$api_service" "$admin_service" "$storefront_service"
compose up -d --force-recreate "$api_service" "$admin_service" "$storefront_service"
assert_service_image "$api_service"
assert_service_image "$admin_service"
assert_service_image "$storefront_service"
bash "$script_dir/wait-for-health.sh" "$api_service"
bash "$script_dir/wait-for-health.sh" "$admin_service"
bash "$script_dir/wait-for-health.sh" "$storefront_service"

compose pull "$worker_service"
compose up -d --force-recreate "$worker_service"
assert_service_image "$worker_service"
bash "$script_dir/wait-for-health.sh" "$worker_service"

routing_changed=true
render_release_nginx_config "$target_release" "$target_slot"
nginx_main_source_file="$target_release/ops/nginx/nginx.conf"
stage_nginx_main_config
ensure_nginx
reload_nginx
bash "$script_dir/smoke-check.sh"

compose pull "$meta_worker_service"
compose up -d --force-recreate "$meta_worker_service"
assert_service_image "$meta_worker_service"
bash "$script_dir/wait-for-health.sh" "$meta_worker_service"

compose stop "$current_worker_service" || true
set_previous_release "$current_release"
set_current_release "$target_release"
set_active_slot "$target_slot"
commit_image_state_transaction
commit_nginx_main_config_transaction
rollback_committed=true
stop_slot_app_services "$current_slot"
remove_obsolete_compose_containers || echo 'warning: obsolete Compose containers require manual cleanup' >&2
printf 'rolled back to verified release %s on slot %s\n' "$(basename "$target_release")" "$target_slot"
