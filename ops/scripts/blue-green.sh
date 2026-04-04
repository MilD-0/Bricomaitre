#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"

source "$script_dir/load-infra-env.sh"

compose_file="${COMPOSE_FILE:-$repo_root/ops/docker/compose.prod.yml}"
runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
state_file="${BRIC_DEPLOY_STATE_FILE:-$runtime_dir/blue-green.env}"
deploy_lock_file="${BRIC_DEPLOY_LOCK_FILE:-$runtime_dir/deploy.lock}"
nginx_conf_dir="${BRIC_NGINX_CONF_DIR:-$runtime_dir/nginx}"
nginx_conf_file="${BRIC_NGINX_CONF_FILE:-$nginx_conf_dir/default.conf}"
default_slot="${BRIC_DEFAULT_ACTIVE_SLOT:-blue}"
releases_dir="${BRIC_RELEASES_DIR:-/srv/bric/releases}"
current_link="${BRIC_CURRENT_LINK:-/srv/bric/current}"
release_marker_name="${BRIC_RELEASE_MARKER_NAME:-.bric-release.env}"
release_keep_count="${BRIC_RELEASE_KEEP_COUNT:-5}"

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
  docker compose -f "$compose_file" "$@"
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
  local required_files=(
    "$release_dir/package.json"
    "$release_dir/pnpm-lock.yaml"
    "$release_dir/ops/scripts/deploy.sh"
    "$release_dir/ops/docker/compose.prod.yml"
    "$release_dir/adminstration/package.json"
    "$release_dir/adminstration/drizzle/migrations/meta/_journal.json"
    "$marker_file"
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
