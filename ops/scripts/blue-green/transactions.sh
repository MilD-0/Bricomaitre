# shellcheck shell=bash

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

begin_runtime_env_transaction() {
  ensure_runtime_dirs
  if [[ -d "$runtime_env_transaction_dir" ]]; then
    echo 'a runtime-environment transaction is already active' >&2
    return 1
  fi
  mkdir -m 0700 "$runtime_env_transaction_dir"
  local name
  for name in admin storefront storefront-api; do
    if [[ -f "$runtime_env_dir/${name}.env" ]]; then
      cp -p "$runtime_env_dir/${name}.env" "$runtime_env_transaction_dir/${name}.env"
      : >"$runtime_env_transaction_dir/${name}.present"
    fi
  done
}

rollback_runtime_env_transaction() {
  if [[ ! -d "$runtime_env_transaction_dir" ]]; then
    return 0
  fi
  local name
  for name in admin storefront storefront-api; do
    if [[ -f "$runtime_env_transaction_dir/${name}.present" ]]; then
      cp -p "$runtime_env_transaction_dir/${name}.env" "$runtime_env_dir/${name}.env"
    else
      rm -f "$runtime_env_dir/${name}.env"
    fi
  done
  rm -rf -- "$runtime_env_transaction_dir"
}

commit_runtime_env_transaction() {
  if [[ -d "$runtime_env_transaction_dir" ]]; then
    rm -rf -- "$runtime_env_transaction_dir"
  fi
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
