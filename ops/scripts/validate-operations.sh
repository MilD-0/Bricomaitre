#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validation_dir="$(mktemp -d)"
trap 'rm -rf "$validation_dir"' EXIT

while IFS= read -r -d '' script; do
  bash -n "$script"
done < <(find "$workspace_dir/ops/scripts" -type f -name '*.sh' -print0)

while IFS= read -r -d '' script; do
  PYTHONPYCACHEPREFIX="$validation_dir/python-cache" python3 -m py_compile "$script"
done < <(find "$workspace_dir/ops/scripts" -type f -name '*.py' -print0)

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
  curl -fsSL \
    "https://github.com/rhysd/actionlint/releases/download/v${actionlint_version}/actionlint_${actionlint_version}_linux_${actionlint_arch}.tar.gz" \
    -o "$actionlint_archive"
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
fi

echo 'Operational scripts, workflow, and Compose configuration are valid.'
