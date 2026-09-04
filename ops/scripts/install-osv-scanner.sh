#!/usr/bin/env bash
set -euo pipefail

osv_version='2.5.1'
cache_root="${BRIC_CI_CACHE_DIR:-${XDG_CACHE_HOME:-/tmp}/bricomaitre-ci}"
osv_cache_dir="$cache_root/osv-scanner/$osv_version"
osv_bin="$osv_cache_dir/osv-scanner"

if [[ "$(uname -s)" != 'Linux' ]]; then
  echo "Unsupported operating system for OSV-Scanner: $(uname -s)" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64)
    osv_arch='amd64'
    binary_sha256='f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be'
    ;;
  aarch64|arm64)
    osv_arch='arm64'
    binary_sha256='3d0f5aa5a6baa8eb32bcef247388e149ef6030a6634ccae6fa0d62681fb27a6d'
    ;;
  *)
    echo "Unsupported architecture for OSV-Scanner: $(uname -m)" >&2
    exit 1
    ;;
esac

download_url="https://github.com/google/osv-scanner/releases/download/v${osv_version}/osv-scanner_linux_${osv_arch}"
mkdir -p "$osv_cache_dir"

exec 9>"$cache_root/osv-scanner/.install.lock"
flock 9

if [[ ! -x "$osv_bin" ]] ||
  ! printf '%s  %s\n' "$binary_sha256" "$osv_bin" | sha256sum -c --status; then
  temporary_bin="$(mktemp "$osv_cache_dir/.osv-scanner.XXXXXX")"
  cleanup() {
    if [[ -n "${temporary_bin:-}" && -e "$temporary_bin" ]]; then
      unlink "$temporary_bin"
    fi
  }
  trap cleanup EXIT

  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --continue-at - \
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --connect-timeout 20 \
    --max-time 300 \
    --output "$temporary_bin" \
    "$download_url"
  printf '%s  %s\n' "$binary_sha256" "$temporary_bin" | sha256sum -c --status
  chmod 755 "$temporary_bin"
  mv "$temporary_bin" "$osv_bin"
  temporary_bin=''
fi

if ! "$osv_bin" --version | grep -Fxq "osv-scanner version: $osv_version"; then
  echo "Cached OSV-Scanner binary did not report version $osv_version." >&2
  exit 1
fi

echo "Using checksum-verified OSV-Scanner $osv_version from $osv_bin" >&2
printf '%s\n' "$osv_bin"
