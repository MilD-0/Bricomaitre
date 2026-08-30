#!/usr/bin/env bash
set -euo pipefail

cosign_version='v3.0.6'
cosign_sha256='c956e5dfcac53d52bcf058360d579472f0c1d2d9b69f55209e256fe7783f4c74'
cache_root="${BRIC_CI_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/bricomaitre-ci}"
cosign_cache_dir="$cache_root/cosign/$cosign_version"
cosign_bin="$cosign_cache_dir/cosign"
download_url="https://github.com/sigstore/cosign/releases/download/$cosign_version/cosign-linux-amd64"

mkdir -p "$cosign_cache_dir"

exec 9>"$cache_root/cosign/.install.lock"
flock 9

if [[ ! -x "$cosign_bin" ]] || ! printf '%s  %s\n' "$cosign_sha256" "$cosign_bin" | sha256sum -c --status; then
  temporary_bin="$(mktemp "$cosign_cache_dir/.cosign.XXXXXX")"
  cleanup() {
    if [[ -n "${temporary_bin:-}" && -e "$temporary_bin" ]]; then
      unlink "$temporary_bin"
    fi
  }
  trap cleanup EXIT

  curl \
    --fail \
    --location \
    --continue-at - \
    --retry 12 \
    --retry-delay 3 \
    --retry-max-time 900 \
    --retry-all-errors \
    --connect-timeout 20 \
    --max-time 300 \
    --output "$temporary_bin" \
    "$download_url"
  printf '%s  %s\n' "$cosign_sha256" "$temporary_bin" | sha256sum -c --status
  chmod 755 "$temporary_bin"
  mv "$temporary_bin" "$cosign_bin"
  temporary_bin=''
fi

"$cosign_bin" version | grep -Fq "$cosign_version"

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$cosign_cache_dir" >> "$GITHUB_PATH"
fi

echo "Using cached Cosign $cosign_version from $cosign_bin"
