# shellcheck shell=bash

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
