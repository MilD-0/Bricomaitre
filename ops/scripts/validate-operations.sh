#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validation_dir="$(mktemp -d)"
trap 'rm -rf "$validation_dir"' EXIT
cache_root="${BRIC_CI_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/bricomaitre-ci}"
download_cache_dir="$cache_root/downloads"
mkdir -p "$download_cache_dir"

download_with_retry() {
  local url="$1"
  local destination="$2"
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --connect-timeout 20 \
    --max-time 180 \
    "$url" \
    -o "$destination"
}

download_from_cache() {
  local url="$1"
  local cache_name="$2"
  local expected_sha256="$3"
  local destination="$4"
  local cache_path="$download_cache_dir/$cache_name"

  exec {cache_lock_fd}>"$cache_path.lock"
  flock "$cache_lock_fd"
  if [[ ! -f "$cache_path" ]] ||
    ! printf '%s  %s\n' "$expected_sha256" "$cache_path" | sha256sum -c --status; then
    download_with_retry "$url" "$destination"
    printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum -c -
    install -m 0644 "$destination" "$cache_path.pending.$$"
    mv -f "$cache_path.pending.$$" "$cache_path"
  else
    cp "$cache_path" "$destination"
  fi
  flock -u "$cache_lock_fd"
  exec {cache_lock_fd}>&-
}

while IFS= read -r -d '' script; do
  bash -n "$script"
done < <(find "$workspace_dir/ops/scripts" -type f -name '*.sh' -print0)

shellcheck_version='0.11.0'
installed_shellcheck="$(command -v shellcheck || true)"
if [[ -n "$installed_shellcheck" ]] &&
  "$installed_shellcheck" --version | grep -Fxq "version: $shellcheck_version"; then
  shellcheck_bin="$installed_shellcheck"
else
  case "$(uname -m)" in
    x86_64|amd64)
      shellcheck_arch='x86_64'
      shellcheck_sha256='8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198'
      ;;
    aarch64|arm64)
      shellcheck_arch='aarch64'
      shellcheck_sha256='12b331c1d2db6b9eb13cfca64306b1b157a86eb69db83023e261eaa7e7c14588'
      ;;
    *)
      echo "Unsupported architecture for ShellCheck: $(uname -m)" >&2
      exit 1
      ;;
  esac

  shellcheck_archive="$validation_dir/shellcheck.tar.xz"
  download_from_cache \
    "https://github.com/koalaman/shellcheck/releases/download/v${shellcheck_version}/shellcheck-v${shellcheck_version}.linux.${shellcheck_arch}.tar.xz" \
    "shellcheck-v${shellcheck_version}.linux.${shellcheck_arch}.tar.xz" \
    "$shellcheck_sha256" \
    "$shellcheck_archive"
  printf '%s  %s\n' "$shellcheck_sha256" "$shellcheck_archive" | sha256sum -c -
  tar -xJf "$shellcheck_archive" -C "$validation_dir"
  shellcheck_bin="$validation_dir/shellcheck-v${shellcheck_version}/shellcheck"
fi

mapfile -d '' shell_scripts < <(
  find "$workspace_dir/ops/scripts" -type f -name '*.sh' -print0 | sort -z
)
"$shellcheck_bin" --external-sources --source-path=SCRIPTDIR "${shell_scripts[@]}"

node "$workspace_dir/ops/scripts/validate-markdown-links.mjs"

while IFS= read -r -d '' script; do
  PYTHONPYCACHEPREFIX="$validation_dir/python-cache" python3 -m py_compile "$script"
done < <(find "$workspace_dir/ops/scripts" -type f -name '*.py' -print0)

if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze verify "$workspace_dir/ops/host/bricomaitre-disable-thp.service"
  rendered_memory_service="$validation_dir/bricomaitre-storefront-memory.service"
  sed \
    -e 's/{{OPERATIONS_USER}}/deploy/g' \
    -e 's/{{OPERATIONS_GROUP}}/deploy/g' \
    "$workspace_dir/ops/host/bricomaitre-storefront-memory.service" \
    >"$rendered_memory_service"
  systemd-analyze verify \
    "$rendered_memory_service" \
    "$workspace_dir/ops/host/bricomaitre-storefront-memory.timer"
fi

if command -v actionlint >/dev/null 2>&1; then
  actionlint_bin="$(command -v actionlint)"
else
  actionlint_version='1.7.12'
  case "$(uname -m)" in
    x86_64|amd64)
      actionlint_arch='amd64'
      actionlint_sha256='8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'
      ;;
    aarch64|arm64)
      actionlint_arch='arm64'
      actionlint_sha256='325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6'
      ;;
    *)
      echo "Unsupported architecture for actionlint: $(uname -m)" >&2
      exit 1
      ;;
  esac

  actionlint_archive="$validation_dir/actionlint.tar.gz"
  download_from_cache \
    "https://github.com/rhysd/actionlint/releases/download/v${actionlint_version}/actionlint_${actionlint_version}_linux_${actionlint_arch}.tar.gz" \
    "actionlint_${actionlint_version}_linux_${actionlint_arch}.tar.gz" \
    "$actionlint_sha256" \
    "$actionlint_archive"
  printf '%s  %s\n' "$actionlint_sha256" "$actionlint_archive" | sha256sum -c -
  tar -xzf "$actionlint_archive" -C "$validation_dir"
  actionlint_bin="$validation_dir/actionlint"
fi

(
  cd "$workspace_dir"
  "$actionlint_bin" -color
)

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  env_dir="$validation_dir/env"
  mkdir -p "$env_dir"
  cp "$workspace_dir/ops/env/admin.env.example" "$env_dir/admin.env"
  cp "$workspace_dir/ops/env/storefront-api.env.example" "$env_dir/storefront-api.env"
  cp "$workspace_dir/ops/env/storefront.env.example" "$env_dir/storefront.env"

  BRIC_ENV_DIR="$env_dir" docker compose \
    --env-file "$workspace_dir/ops/env/infra.env.example" \
    -f "$workspace_dir/ops/docker/compose.prod.yml" \
    config --quiet

  if ! docker buildx version >/dev/null 2>&1; then
    echo 'docker buildx is required for production packaging validation' >&2
    exit 1
  fi

  build_check_log="$validation_dir/build-check.log"
  build_check_max_attempts=3
  build_check_succeeded='false'
  for attempt in $(seq 1 "$build_check_max_attempts"); do
    if (
      cd "$workspace_dir"
      GOOGLE_CLIENT_SECRET=build-check-placeholder \
        BETTER_AUTH_SECRET=build-check-placeholder \
        SENTRY_AUTH_TOKEN=build-check-placeholder \
        docker buildx bake \
          --check \
          --file ops/docker/docker-bake.hcl \
          api admin storefront
    ) 2>&1 | tee "$build_check_log"; then
      build_check_succeeded='true'
      break
    fi

    if ! grep -Eiq \
      'i/o timeout|TLS handshake timeout|connection reset by peer|temporary failure in name resolution' \
      "$build_check_log"; then
      exit 1
    fi
    if ((attempt < build_check_max_attempts)); then
      echo "BuildKit registry metadata check hit a transient network error; retrying ($attempt/$build_check_max_attempts)." >&2
      sleep "$((attempt * 2))"
    fi
  done
  if [[ "$build_check_succeeded" != 'true' ]]; then
    exit 1
  fi
fi

echo 'Operational scripts, workflow, and Compose configuration are valid.'
