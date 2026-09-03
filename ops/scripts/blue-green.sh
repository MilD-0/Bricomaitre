#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"

# shellcheck source=load-infra-env.sh
source "$script_dir/load-infra-env.sh"

compose_file="${COMPOSE_FILE:-$repo_root/ops/docker/compose.prod.yml}"
runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
state_file="${BRIC_DEPLOY_STATE_FILE:-$runtime_dir/blue-green.env}"
image_state_file="${BRIC_IMAGE_STATE_FILE:-$runtime_dir/images.env}"
deploy_lock_file="${BRIC_DEPLOY_LOCK_FILE:-$runtime_dir/deploy.lock}"
nginx_conf_dir="${BRIC_NGINX_CONF_DIR:-$runtime_dir/nginx}"
nginx_conf_file="${BRIC_NGINX_CONF_FILE:-$nginx_conf_dir/default.conf}"
nginx_template_file="${BRIC_NGINX_TEMPLATE_FILE:-$repo_root/ops/nginx/templates/default.conf.template}"
nginx_main_conf_dir="${BRIC_NGINX_MAIN_CONF_DIR:-$runtime_dir/nginx-main}"
nginx_main_conf_file="${BRIC_NGINX_MAIN_CONF_FILE:-$nginx_main_conf_dir/nginx.conf}"
nginx_main_source_file="${BRIC_NGINX_MAIN_SOURCE_FILE:-$repo_root/ops/nginx/nginx.conf}"
certbot_webroot_dir="${BRIC_CERTBOT_WEBROOT_DIR:-$runtime_dir/certbot-webroot}"
default_slot="${BRIC_DEFAULT_ACTIVE_SLOT:-blue}"
releases_dir="${BRIC_RELEASES_DIR:-/srv/bric/releases}"
current_link="${BRIC_CURRENT_LINK:-/srv/bric/current}"
previous_link="${BRIC_PREVIOUS_LINK:-/srv/bric/previous}"
release_marker_name="${BRIC_RELEASE_MARKER_NAME:-.bric-release.env}"
release_images_marker_name="${BRIC_RELEASE_IMAGES_MARKER_NAME:-.bric-images.env}"
release_keep_count="${BRIC_RELEASE_KEEP_COUNT:-5}"
image_ref_regex="${BRIC_IMAGE_REF_REGEX:-}"
if [[ -z "$image_ref_regex" ]]; then
  image_ref_regex='^ghcr[.]io/mild-0/bricomaitre/[a-z0-9-]+@sha256:[a-f0-9]{64}$'
fi
legacy_image_ref_regex="${BRIC_LEGACY_IMAGE_REF_REGEX:-}"
if [[ -z "$legacy_image_ref_regex" ]]; then
  legacy_image_ref_regex='^ghcr[.]io/mild-0/bricomaitre2/[a-z0-9-]+@sha256:[a-f0-9]{64}$'
fi
cosign_certificate_identity="${BRIC_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main}"
legacy_cosign_certificate_identity="${BRIC_LEGACY_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main}"
cosign_oidc_issuer="${BRIC_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"
verified_release_layout=""

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

render_nginx_config() {
  local slot="${1:?slot is required}"
  require_slot "$slot"
  ensure_runtime_dirs

  python3 "$script_dir/render-nginx-config.py" \
    "$nginx_template_file" \
    "$nginx_conf_file" \
    "$slot"
}

render_release_nginx_config() {
  local release_dir="${1:?release directory is required}"
  local slot="${2:?slot is required}"
  local release_template="$release_dir/ops/nginx/templates/default.conf.template"
  local release_renderer="$release_dir/ops/scripts/render-nginx-config.py"

  require_slot "$slot"
  ensure_runtime_dirs

  case "$release_dir" in
    "$releases_dir"/*) ;;
    *)
      echo "Nginx rollback release must be under ${releases_dir}: ${release_dir}" >&2
      return 1
      ;;
  esac

  if [[ ! -f "$release_template" ]]; then
    echo "Nginx rollback template is missing: ${release_template}" >&2
    return 1
  fi
  if [[ ! -f "$release_renderer" ]]; then
    echo "Nginx rollback renderer is missing: ${release_renderer}" >&2
    return 1
  fi

  # Service identities can change between releases. Render the template that
  # belongs to the release whose containers will actually receive traffic,
  # using the renderer version that understands that template's variables.
  python3 "$release_renderer" \
    "$release_template" \
    "$nginx_conf_file" \
    "$slot"
}

nginx_main_config_snapshot=""

begin_nginx_main_config_transaction() {
  local fallback_source="${1:-}"

  if [[ -n "$nginx_main_config_snapshot" ]]; then
    echo "an Nginx main-config transaction is already active" >&2
    return 1
  fi

  ensure_runtime_dirs
  nginx_main_config_snapshot="$(mktemp "${runtime_dir}/nginx-main.conf.rollback.XXXXXX")"

  if [[ -f "$nginx_main_conf_file" ]]; then
    cp -p "$nginx_main_conf_file" "$nginx_main_config_snapshot"
  elif [[ -n "$fallback_source" && -f "$fallback_source" ]]; then
    cp -p "$fallback_source" "$nginx_main_config_snapshot"
  else
    echo "cannot start Nginx main-config transaction without an existing or fallback config" >&2
    rm -f "$nginx_main_config_snapshot"
    nginx_main_config_snapshot=""
    return 1
  fi
}

stage_nginx_main_config() {
  local staged_file

  if [[ -z "$nginx_main_config_snapshot" ]]; then
    echo "stage_nginx_main_config requires an active transaction" >&2
    return 1
  fi
  if [[ ! -f "$nginx_main_source_file" ]]; then
    echo "missing Nginx main config: ${nginx_main_source_file}" >&2
    return 1
  fi

  staged_file="$(mktemp "${nginx_main_conf_dir}/nginx.conf.tmp.XXXXXX")"
  cp "$nginx_main_source_file" "$staged_file"
  chmod 0644 "$staged_file"
  mv "$staged_file" "$nginx_main_conf_file"
}

rollback_nginx_main_config_transaction() {
  if [[ -z "$nginx_main_config_snapshot" ]]; then
    return 0
  fi

  mv "$nginx_main_config_snapshot" "$nginx_main_conf_file"
  nginx_main_config_snapshot=""
}

commit_nginx_main_config_transaction() {
  if [[ -n "$nginx_main_config_snapshot" ]]; then
    rm -f "$nginx_main_config_snapshot"
  fi
  nginx_main_config_snapshot=""
}

ensure_nginx() {
  compose up -d nginx
}

reload_nginx() {
  compose exec -T nginx nginx -t -c /etc/nginx-main/nginx.conf
  compose exec -T nginx nginx -s reload -c /etc/nginx-main/nginx.conf
}

verify_release_dir() {
  local release_dir="${1:?release dir is required}"
  local expected_commit="${2:-}"
  local marker_file="$release_dir/$release_marker_name"
  local images_marker_file="$release_dir/$release_images_marker_name"
  local common_required_files=(
    "$release_dir/ops/scripts/deploy.sh"
    "$release_dir/ops/docker/compose.prod.yml"
    "$release_dir/ops/nginx/nginx.conf"
    "$release_dir/ops/nginx/templates/default.conf.template"
    "$marker_file"
    "$images_marker_file"
  )
  local public_legal_files=(
    "$release_dir/LICENSE"
    "$release_dir/NOTICE"
    "$release_dir/SECURITY.md"
    "$release_dir/third_party/licenses/GPL-3.0-only.txt"
    "$release_dir/third_party/licenses/LGPL-3.0-or-later.txt"
    "$release_dir/third_party/licenses/SHARP-LIBVIPS-THIRD-PARTY-NOTICES.md"
    "$release_dir/third_party/licenses/SHARP-LIBVIPS-VERSIONS.json"
  )
  # Retain one release-generation compatibility window so the first public
  # release can roll back to the immediately preceding bundle. New deployments
  # (which always supply expected_commit) must use the public legal layout.
  local legacy_legal_files=(
    "$release_dir/ops/ownership/AI_AGENT_BOUNDARY.md"
    "$release_dir/ops/ownership/BRICOMAITRE_AUTHORIZED_RELEASE.txt"
    "$release_dir/ops/ownership/AI_POLICY.md"
    "$release_dir/ops/ownership/LICENSE"
    "$release_dir/ops/ownership/NOTICE"
    "$release_dir/ops/ownership/SECURITY.md"
    "$release_dir/AGENTS.md"
    "$release_dir/LICENSE"
    "$release_dir/NOTICE"
    "$release_dir/SECURITY.md"
    "$release_dir/.well-known/ai-policy.md"
  )
  local file

  verified_release_layout=""

  for file in "${common_required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "release is missing required file: $file" >&2
      exit 1
    fi
  done

  release_has_all_files() {
    local candidate
    for candidate in "$@"; do
      [[ -f "$candidate" ]] || return 1
    done
  }

  if release_has_all_files "${public_legal_files[@]}"; then
    # Consumed by rollback.sh after this library returns.
    # shellcheck disable=SC2034
    verified_release_layout="public"
  elif [[ -z "$expected_commit" ]] && release_has_all_files "${legacy_legal_files[@]}"; then
    # Consumed by rollback.sh after this library returns.
    # shellcheck disable=SC2034
    verified_release_layout="legacy"
    echo 'warning: accepting a retained legacy release for rollback compatibility' >&2
  else
    echo 'release is missing the complete public legal/license surface' >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$marker_file"
  set +a

  if [[ -z "${BRIC_RELEASE_ID:-}" || -z "${BRIC_RELEASE_COMMIT:-}" ]]; then
    echo "release marker is incomplete: $marker_file" >&2
    exit 1
  fi

  if [[ -n "$expected_commit" && "${BRIC_RELEASE_COMMIT}" != "$expected_commit" ]]; then
    echo "release commit mismatch: expected $expected_commit but found ${BRIC_RELEASE_COMMIT}" >&2
    exit 1
  fi
}

slot_env_suffix() {
  local slot="${1:?slot is required}"
  require_slot "$slot"

  if [[ "$slot" == "blue" ]]; then
    printf 'BLUE\n'
  else
    printf 'GREEN\n'
  fi
}

verify_image_ref_format() {
  local image_ref="${1:?image ref is required}"
  local verification_profile="${2:-public}"
  local expected_regex="$image_ref_regex"

  if [[ "$verification_profile" == "legacy" ]]; then
    expected_regex="$legacy_image_ref_regex"
  elif [[ "$verification_profile" != "public" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  if [[ ! "$image_ref" =~ $expected_regex ]]; then
    echo "invalid image ref; expected immutable GHCR digest ref: $image_ref" >&2
    return 1
  fi
}

verify_signed_image() {
  local image_ref="${1:?image ref is required}"
  local verification_profile="${2:-public}"
  local expected_identity="$cosign_certificate_identity"

  if [[ "$verification_profile" == "legacy" ]]; then
    expected_identity="$legacy_cosign_certificate_identity"
  elif [[ "$verification_profile" != "public" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  if ! command -v cosign >/dev/null 2>&1; then
    echo "cosign is required on the VPS before registry-based deploys" >&2
    return 1
  fi

  cosign verify \
    --certificate-identity "$expected_identity" \
    --certificate-oidc-issuer "$cosign_oidc_issuer" \
    "$image_ref" >/dev/null
}

require_release_image_manifest() {
  local images_file="${1:?images manifest is required}"

  # shellcheck disable=SC1090
  source "$images_file"

  local required_vars=(
    BRIC_IMAGE_STOREFRONT_API
    BRIC_IMAGE_STOREFRONT_META_WORKER
    BRIC_IMAGE_ADMIN_WEB
    BRIC_IMAGE_ADMIN_WORKER
    BRIC_IMAGE_ADMIN_MIGRATIONS
    BRIC_IMAGE_STOREFRONT_WEB
    BRIC_STOREFRONT_APP
  )
  local var

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      echo "release image manifest is missing ${var}: ${images_file}" >&2
      return 1
    fi
  done

  if [[ "$BRIC_STOREFRONT_APP" != "storefront" ]]; then
    echo "BRIC_STOREFRONT_APP must identify storefront" >&2
    return 1
  fi
}

env_value_or_default() {
  local var_name="${1:?var name is required}"
  local default_value="${2:-}"

  printf '%s\n' "${!var_name:-$default_value}"
}

apply_release_images() {
  local target_slot="${1:?target slot is required}"
  local images_file="${2:?images manifest is required}"
  local verification_profile="${3:-public}"
  local slot_suffix
  local state_tmp

  require_slot "$target_slot"
  require_release_image_manifest "$images_file"

  if [[ "$verification_profile" != "public" && "$verification_profile" != "legacy" ]]; then
    echo "invalid image verification profile: $verification_profile" >&2
    return 1
  fi

  local release_storefront_api="$BRIC_IMAGE_STOREFRONT_API"
  local release_storefront_meta_worker="$BRIC_IMAGE_STOREFRONT_META_WORKER"
  local release_admin_web="$BRIC_IMAGE_ADMIN_WEB"
  local release_admin_worker="$BRIC_IMAGE_ADMIN_WORKER"
  local release_admin_migrations="$BRIC_IMAGE_ADMIN_MIGRATIONS"
  local release_storefront_web="$BRIC_IMAGE_STOREFRONT_WEB"

  local image_refs=(
    "$release_storefront_api"
    "$release_storefront_meta_worker"
    "$release_admin_web"
    "$release_admin_worker"
    "$release_admin_migrations"
    "$release_storefront_web"
  )
  local image_ref

  for image_ref in "${image_refs[@]}"; do
    verify_image_ref_format "$image_ref" "$verification_profile"
    verify_signed_image "$image_ref" "$verification_profile"
    docker pull "$image_ref"
  done

  ensure_runtime_dirs

  if [[ -f "$image_state_file" ]]; then
    # shellcheck disable=SC1090
    source "$image_state_file"
  fi

  slot_suffix="$(slot_env_suffix "$target_slot")"
  state_tmp="$(mktemp "${image_state_file}.tmp.XXXXXX")"

  {
    for slot in BLUE GREEN; do
      if [[ "$slot" == "$slot_suffix" ]]; then
        printf 'BRIC_IMAGE_STOREFRONT_API_%s=%s\n' "$slot" "$release_storefront_api"
        printf 'BRIC_IMAGE_ADMIN_WEB_%s=%s\n' "$slot" "$release_admin_web"
        printf 'BRIC_IMAGE_ADMIN_WORKER_%s=%s\n' "$slot" "$release_admin_worker"
        printf 'BRIC_IMAGE_ADMIN_MIGRATIONS_%s=%s\n' "$slot" "$release_admin_migrations"
        printf 'BRIC_IMAGE_STOREFRONT_WEB_%s=%s\n' "$slot" "$release_storefront_web"
      else
        printf 'BRIC_IMAGE_STOREFRONT_API_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_STOREFRONT_API_${slot}" "$release_storefront_api")"
        printf 'BRIC_IMAGE_ADMIN_WEB_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_WEB_${slot}" "$release_admin_web")"
        printf 'BRIC_IMAGE_ADMIN_WORKER_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_WORKER_${slot}" "$release_admin_worker")"
        printf 'BRIC_IMAGE_ADMIN_MIGRATIONS_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_ADMIN_MIGRATIONS_${slot}" "$release_admin_migrations")"
        printf 'BRIC_IMAGE_STOREFRONT_WEB_%s=%s\n' "$slot" "$(env_value_or_default "BRIC_IMAGE_STOREFRONT_WEB_${slot}" "$release_storefront_web")"
      fi
    done

    printf 'BRIC_IMAGE_STOREFRONT_META_WORKER=%s\n' "$release_storefront_meta_worker"
  } >"$state_tmp"

  mv "$state_tmp" "$image_state_file"
}

image_state_snapshot=""
image_state_had_file=false

begin_image_state_transaction() {
  if [[ -n "$image_state_snapshot" ]]; then
    echo "an image-state transaction is already active" >&2
    return 1
  fi

  ensure_runtime_dirs
  image_state_snapshot="$(mktemp "${runtime_dir}/images.env.rollback.XXXXXX")"
  if [[ -f "$image_state_file" ]]; then
    cp -p "$image_state_file" "$image_state_snapshot"
    image_state_had_file=true
  else
    : >"$image_state_snapshot"
    image_state_had_file=false
  fi
}

rollback_image_state_transaction() {
  if [[ -z "$image_state_snapshot" ]]; then
    return 0
  fi

  if [[ "$image_state_had_file" == true ]]; then
    mv "$image_state_snapshot" "$image_state_file"
  else
    rm -f "$image_state_file" "$image_state_snapshot"
  fi
  image_state_snapshot=""
  image_state_had_file=false
}

commit_image_state_transaction() {
  if [[ -n "$image_state_snapshot" ]]; then
    rm -f "$image_state_snapshot"
  fi
  image_state_snapshot=""
  image_state_had_file=false
}

release_link_target() {
  local link="${1:?release link is required}"

  if [[ -L "$link" || -e "$link" ]]; then
    readlink -f "$link"
  fi
}

set_release_link() {
  local link="${1:?release link is required}"
  local release_dir="${2:?release directory is required}"
  local resolved_release

  resolved_release="$(cd "$release_dir" && pwd -P)"
  case "$resolved_release" in
    "$releases_dir"/*) ;;
    *)
      echo "release link target must be inside ${releases_dir}: ${resolved_release}" >&2
      return 1
      ;;
  esac

  mkdir -p "$(dirname "$link")"
  ln -sfn "$resolved_release" "$link"
}

restore_release_link() {
  local link="${1:?release link is required}"
  local target="${2:-}"

  if [[ -n "$target" ]]; then
    set_release_link "$link" "$target"
  else
    rm -f "$link"
  fi
}

set_current_release() {
  local release_dir="${1:?release dir is required}"

  set_release_link "$current_link" "$release_dir"
}

set_previous_release() {
  local release_dir="${1:?release dir is required}"

  set_release_link "$previous_link" "$release_dir"
}

prune_old_releases() {
  local keep="${1:-$release_keep_count}"
  local release_paths=()
  local current_target=""
  local previous_target=""
  local path

  if [[ ! -d "$releases_dir" ]]; then
    return 0
  fi

  if [[ -L "$current_link" || -e "$current_link" ]]; then
    current_target="$(readlink -f "$current_link")"
  fi
  if [[ -L "$previous_link" || -e "$previous_link" ]]; then
    previous_target="$(readlink -f "$previous_link")"
  fi

  while IFS= read -r path; do
    release_paths+=("$path")
  done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | cut -d' ' -f2-)

  if (( ${#release_paths[@]} <= keep )); then
    return 0
  fi

  for path in "${release_paths[@]:0:${#release_paths[@]}-keep}"; do
    if [[ -n "$current_target" && "$path" == "$current_target" ]]; then
      continue
    fi
    if [[ -n "$previous_target" && "$path" == "$previous_target" ]]; then
      continue
    fi
    rm -rf "$path"
  done
}
