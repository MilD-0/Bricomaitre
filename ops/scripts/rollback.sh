#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

source "$script_dir/blue-green.sh"

acquire_deploy_lock
ensure_runtime_dirs
validate_current_release_link

current_slot="$(get_active_slot)"
target_slot="$(get_inactive_slot "$current_slot")"

api_service="$(service_name storefront-api "$target_slot")"
admin_service="$(service_name adminstration "$target_slot")"
storefront_service="$(service_name storefront "$target_slot")"
worker_service="$(service_name admin-worker "$target_slot")"
current_worker_service="$(service_name admin-worker "$current_slot")"

compose pull "$api_service" "$admin_service" "$storefront_service"
compose up -d --force-recreate "$api_service" "$admin_service" "$storefront_service"
assert_service_image "$api_service"
assert_service_image "$admin_service"
assert_service_image "$storefront_service"
bash "$script_dir/wait-for-health.sh" "$api_service"
bash "$script_dir/wait-for-health.sh" "$admin_service"
bash "$script_dir/wait-for-health.sh" "$storefront_service"

render_nginx_config "$target_slot"
ensure_nginx
reload_nginx

bash "$script_dir/smoke-check.sh"

compose stop "$current_worker_service" || true
compose pull "$worker_service"
compose up -d --force-recreate "$worker_service"
assert_service_image "$worker_service"

set_active_slot "$target_slot"
printf 'rolled back to slot %s\n' "$target_slot"
