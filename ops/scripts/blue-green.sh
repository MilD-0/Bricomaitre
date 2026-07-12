#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"

source "$script_dir/load-infra-env.sh"

compose_file="${COMPOSE_FILE:-$repo_root/ops/docker/compose.prod.yml}"
runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
state_file="${BRIC_DEPLOY_STATE_FILE:-$runtime_dir/blue-green.env}"
image_state_file="${BRIC_IMAGE_STATE_FILE:-$runtime_dir/images.env}"
deploy_lock_file="${BRIC_DEPLOY_LOCK_FILE:-$runtime_dir/deploy.lock}"
nginx_conf_dir="${BRIC_NGINX_CONF_DIR:-$runtime_dir/nginx}"
nginx_conf_file="${BRIC_NGINX_CONF_FILE:-$nginx_conf_dir/default.conf}"
default_slot="${BRIC_DEFAULT_ACTIVE_SLOT:-blue}"
releases_dir="${BRIC_RELEASES_DIR:-/srv/bric/releases}"
current_link="${BRIC_CURRENT_LINK:-/srv/bric/current}"
release_marker_name="${BRIC_RELEASE_MARKER_NAME:-.bric-release.env}"
release_images_marker_name="${BRIC_RELEASE_IMAGES_MARKER_NAME:-.bric-images.env}"
release_keep_count="${BRIC_RELEASE_KEEP_COUNT:-5}"
image_ref_regex="${BRIC_IMAGE_REF_REGEX:-}"
if [[ -z "$image_ref_regex" ]]; then
  image_ref_regex='^ghcr[.]io/mild-0/bricomaitre2/[a-z0-9-]+@sha256:[a-f0-9]{64}$'
fi
cosign_certificate_identity="${BRIC_COSIGN_CERTIFICATE_IDENTITY:-https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main}"
cosign_oidc_issuer="${BRIC_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"

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
    adminstration-*)
      slot="${service#adminstration-}"
      key="BRIC_IMAGE_ADMIN_WEB_${slot^^}"
      ;;
    admin-worker-*)
      slot="${service#admin-worker-}"
      key="BRIC_IMAGE_ADMIN_WORKER_${slot^^}"
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
  mkdir -p "$runtime_dir" "$nginx_conf_dir" "$releases_dir"
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
  local storefront_server_names
  require_slot "$slot"
  ensure_runtime_dirs

  if [[ "${BRIC_STOREFRONT_DOMAIN:-www.example.com}" = "${BRIC_STOREFRONT_APEX_DOMAIN:-example.com}" ]]; then
    storefront_server_names="${BRIC_STOREFRONT_DOMAIN:-www.example.com}"
  else
    storefront_server_names="${BRIC_STOREFRONT_DOMAIN:-www.example.com} ${BRIC_STOREFRONT_APEX_DOMAIN:-example.com}"
  fi

  cat >"$nginx_conf_file" <<EOF
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

resolver 127.0.0.11 ipv6=off valid=30s;

server {
  listen 80;
  server_name ${BRIC_API_DOMAIN:-api.example.com};

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 80;
  server_name ${BRIC_ADMIN_DOMAIN:-admin.example.com};

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 80;
  server_name ${storefront_server_names};

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl;
  http2 on;
  server_name ${BRIC_API_DOMAIN:-api.example.com};

  ssl_certificate /etc/letsencrypt/live/${BRIC_API_CERT_NAME:-api.example.com}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${BRIC_API_CERT_NAME:-api.example.com}/privkey.pem;

  client_max_body_size 10m;

  location / {
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_pass http://storefront-api-${slot}:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 443 ssl;
  http2 on;
  server_name ${BRIC_ADMIN_DOMAIN:-admin.example.com};

  ssl_certificate /etc/letsencrypt/live/${BRIC_ADMIN_CERT_NAME:-admin.example.com}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${BRIC_ADMIN_CERT_NAME:-admin.example.com}/privkey.pem;

  client_max_body_size 50m;

  location / {
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_pass http://adminstration-${slot}:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 443 ssl;
  http2 on;
  server_name ${storefront_server_names};

  ssl_certificate /etc/letsencrypt/live/${BRIC_STOREFRONT_CERT_NAME:-www.example.com}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${BRIC_STOREFRONT_CERT_NAME:-www.example.com}/privkey.pem;

  client_max_body_size 20m;

  location = /api/capi {
    proxy_pass http://storefront-api-${slot}:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location = /api/meta/events {
    proxy_pass http://storefront-api-${slot}:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_pass http://storefront-${slot}:3002;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}
EOF
}

ensure_nginx() {
  compose up -d nginx
}

reload_nginx() {
  compose exec -T nginx nginx -s reload
}

verify_release_dir() {
  local release_dir="${1:?release dir is required}"
  local expected_commit="${2:-}"
  local marker_file="$release_dir/$release_marker_name"
  local images_marker_file="$release_dir/$release_images_marker_name"
  local required_files=(
    "$release_dir/ops/scripts/deploy.sh"
    "$release_dir/ops/docker/compose.prod.yml"
    "$release_dir/ops/nginx/nginx.conf"
    "$release_dir/ops/ownership/AI_AGENT_BOUNDARY.md"
    "$release_dir/ops/ownership/BRICOMAITRE_AUTHORIZED_RELEASE.txt"
    "$release_dir/ops/ownership/AI_POLICY.md"
    "$release_dir/ops/ownership/LICENSE"
    "$release_dir/ops/ownership/NOTICE"
    "$release_dir/ops/ownership/SECURITY.md"
    "$release_dir/AGENTS.md"
    "$release_dir/CLAUDE.md"
    "$release_dir/LICENSE"
    "$release_dir/NOTICE"
    "$release_dir/SECURITY.md"
    "$release_dir/.well-known/ai-policy.md"
    "$marker_file"
    "$images_marker_file"
  )
  local file

  for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "release is missing required file: $file" >&2
      exit 1
    fi
  done

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

  if [[ ! "$image_ref" =~ $image_ref_regex ]]; then
    echo "invalid image ref; expected immutable GHCR digest ref: $image_ref" >&2
    return 1
  fi
}

verify_signed_image() {
  local image_ref="${1:?image ref is required}"

  if ! command -v cosign >/dev/null 2>&1; then
    echo "cosign is required on the VPS before registry-based deploys" >&2
    return 1
  fi

  cosign verify \
    --certificate-identity "$cosign_certificate_identity" \
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
    BRIC_STOREFRONT_STATIC_PAGES
  )
  local var

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      echo "release image manifest is missing ${var}: ${images_file}" >&2
      return 1
    fi
  done

  if [[ ! "${BRIC_STOREFRONT_STATIC_PAGES}" =~ ^[0-9]+$ ]]; then
    echo "BRIC_STOREFRONT_STATIC_PAGES must be an integer" >&2
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
  local slot_suffix
  local state_tmp

  require_slot "$target_slot"
  require_release_image_manifest "$images_file"

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
    verify_image_ref_format "$image_ref"
    verify_signed_image "$image_ref"
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

set_current_release() {
  local release_dir="${1:?release dir is required}"

  mkdir -p "$(dirname "$current_link")"
  ln -sfn "$release_dir" "$current_link"
}

prune_old_releases() {
  local keep="${1:-$release_keep_count}"
  local release_paths=()
  local current_target=""
  local path

  if [[ ! -d "$releases_dir" ]]; then
    return 0
  fi

  if [[ -L "$current_link" || -e "$current_link" ]]; then
    current_target="$(readlink -f "$current_link")"
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
    rm -rf "$path"
  done
}
