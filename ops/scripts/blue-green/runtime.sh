# shellcheck shell=bash

slot_is_valid() {
  [[ "$1" == "blue" || "$1" == "green" ]]
}

require_slot() {
  local slot="${1:-}"

  if ! slot_is_valid "$slot"; then
    echo "invalid slot: $slot" >&2
    exit 1
  fi
}

compose() {
  local env_args=()
  local image_env_args=()
  local image_env_names=(
    BRIC_IMAGE_STOREFRONT_API_BLUE
    BRIC_IMAGE_STOREFRONT_API_GREEN
    BRIC_IMAGE_STOREFRONT_META_WORKER
    BRIC_IMAGE_ADMIN_WEB_BLUE
    BRIC_IMAGE_ADMIN_WEB_GREEN
    BRIC_IMAGE_ADMIN_WORKER_BLUE
    BRIC_IMAGE_ADMIN_WORKER_GREEN
    BRIC_IMAGE_ADMIN_MIGRATIONS_BLUE
    BRIC_IMAGE_ADMIN_MIGRATIONS_GREEN
    BRIC_IMAGE_STOREFRONT_WEB_BLUE
    BRIC_IMAGE_STOREFRONT_WEB_GREEN
  )

  if [[ -f "$image_state_file" ]]; then
    env_args+=(--env-file "$image_state_file")
  fi

  local image_env_name
  for image_env_name in "${image_env_names[@]}"; do
    image_env_args+=(-u "$image_env_name")
  done

  # Compose gives exported shell variables precedence over --env-file. Always
  # remove image overrides so the runtime digest pins in images.env are used.
  env "${image_env_args[@]}" docker compose "${env_args[@]}" -f "$compose_file" "$@"
}

expected_service_image() {
  local service="${1:?service name is required}"
  local key
  local slot

  case "$service" in
    storefront-api-*)
      slot="${service#storefront-api-}"
      key="BRIC_IMAGE_STOREFRONT_API_${slot^^}"
      ;;
    admin-worker-*)
      slot="${service#admin-worker-}"
      key="BRIC_IMAGE_ADMIN_WORKER_${slot^^}"
      ;;
    admin-*)
      slot="${service#admin-}"
      key="BRIC_IMAGE_ADMIN_WEB_${slot^^}"
      ;;
    storefront-meta-worker)
      key="BRIC_IMAGE_STOREFRONT_META_WORKER"
      ;;
    storefront-*)
      slot="${service#storefront-}"
      key="BRIC_IMAGE_STOREFRONT_WEB_${slot^^}"
      ;;
    *)
      echo "unsupported service for image verification: ${service}" >&2
      return 1
      ;;
  esac

  local image_ref
  image_ref="$(sed -n "s/^${key}=//p" "$image_state_file" | tail -n 1)"
  if [[ -z "$image_ref" ]]; then
    echo "missing image reference ${key} for ${service}" >&2
    return 1
  fi

  printf '%s\n' "$image_ref"
}

assert_service_image() {
  local service="${1:?service name is required}"
  local expected_image
  local container_id
  local actual_image

  expected_image="$(expected_service_image "$service")"
  container_id="$(compose ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "${service} did not create a container" >&2
    return 1
  fi

  actual_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
  if [[ "$actual_image" != "$expected_image" ]]; then
    echo "${service} is running ${actual_image}, expected ${expected_image}" >&2
    return 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p \
    "$runtime_dir" \
    "$nginx_conf_dir" \
    "$nginx_main_conf_dir" \
    "$certbot_webroot_dir" \
    "$releases_dir"
}

validate_current_release_link() {
  if [[ ! -e "$current_link" && ! -L "$current_link" ]]; then
    return 0
  fi

  if [[ ! -L "$current_link" ]]; then
    echo "${current_link} must be a symlink to a release under ${releases_dir}; found $(stat -c '%F' "$current_link" 2>/dev/null || echo 'non-symlink path') instead" >&2
    echo "repair the VPS by moving the existing path aside and recreating ${current_link} as a symlink to the active release" >&2
    exit 1
  fi

  local current_target
  current_target="$(readlink -f "$current_link")"

  if [[ -z "$current_target" || ! -d "$current_target" ]]; then
    echo "${current_link} points to a missing release directory" >&2
    exit 1
  fi

  case "$current_target" in
    "$releases_dir"/*) ;;
    *)
      echo "${current_link} must point inside ${releases_dir}; got ${current_target}" >&2
      exit 1
      ;;
  esac
}

acquire_deploy_lock() {
  ensure_runtime_dirs
  exec 9>"$deploy_lock_file"

  if ! flock -n 9; then
    echo "another deploy or rollback is already running" >&2
    exit 1
  fi
}

get_active_slot() {
  local slot="$default_slot"

  if [[ -f "$state_file" ]]; then
    # shellcheck disable=SC1090
    source "$state_file"
    slot="${BRIC_ACTIVE_SLOT:-$slot}"
  fi

  require_slot "$slot"
  printf '%s\n' "$slot"
}

get_inactive_slot() {
  local active_slot="${1:?active slot is required}"
  require_slot "$active_slot"

  if [[ "$active_slot" == "blue" ]]; then
    printf 'green\n'
  else
    printf 'blue\n'
  fi
}

set_active_slot() {
  local slot="${1:?slot is required}"
  require_slot "$slot"
  ensure_runtime_dirs
  printf 'BRIC_ACTIVE_SLOT=%s\n' "$slot" >"$state_file"
}

service_name() {
  local base_name="${1:?service base name is required}"
  local slot="${2:?slot is required}"
  require_slot "$slot"
  printf '%s-%s\n' "$base_name" "$slot"
}

stop_slot_app_services() {
  local slot="${1:?slot is required}"
  require_slot "$slot"

  compose stop \
    "$(service_name storefront "$slot")" \
    "$(service_name admin "$slot")" \
    "$(service_name storefront-api "$slot")" || true
}

remove_slot_release_services() {
  local slot="${1:?slot is required}"
  require_slot "$slot"

  compose rm -sf \
    "$(service_name storefront "$slot")" \
    "$(service_name admin "$slot")" \
    "$(service_name storefront-api "$slot")" \
    "$(service_name admin-worker "$slot")" \
    "$(service_name admin-migrations "$slot")" || true
}

remove_obsolete_compose_containers() {
  local known_services
  local container_id
  local service

  known_services="$(compose config --services)"
  while IFS=' ' read -r container_id service; do
    if [[ -z "$container_id" || -z "$service" ]]; then
      continue
    fi
    if ! grep -Fxq "$service" <<<"$known_services"; then
      docker rm -f "$container_id"
    fi
  done < <(
    docker ps -a \
      --filter 'label=com.docker.compose.project=bricadmin' \
      --format '{{.ID}} {{.Label "com.docker.compose.service"}}'
  )
}

slot_api_host_port() {
  local slot="${1:?slot is required}"
  require_slot "$slot"

  if [[ "$slot" == "blue" ]]; then
    printf '3101\n'
  else
    printf '3102\n'
  fi
}

slot_stack_present() {
  local slot="${1:?slot is required}"
  local container_id

  container_id="$(compose ps -q "$(service_name storefront-api "$slot")")"

  if [[ -z "$container_id" ]]; then
    return 1
  fi

  docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null | grep -qx 'true'
}
