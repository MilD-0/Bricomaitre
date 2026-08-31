#!/usr/bin/env bash
set -euo pipefail

gitleaks_version='8.18.4'
cache_root="${BRIC_CI_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/bricomaitre-ci}"
gitleaks_cache_dir="$cache_root/gitleaks/$gitleaks_version"
gitleaks_bin="$gitleaks_cache_dir/gitleaks"

if [[ "$(uname -s)" != 'Linux' ]]; then
  echo "Unsupported operating system for Gitleaks: $(uname -s)" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64)
    gitleaks_arch='x64'
    archive_sha256='ba6dbb656933921c775ee5a2d1c13a91046e7952e9d919f9bac4cec61d628e7d'
    binary_sha256='46a05260e7cce527f132cb618de59d22262b8b5eb47f66c288447b95c7a98b7e'
    ;;
  aarch64|arm64)
    gitleaks_arch='arm64'
    archive_sha256='bf5f7f466ebfade1296c8bd32cf7d3f592c2aa78836aa9980ffbe2cadca7a861'
    binary_sha256='fc286fab02c3a0ba80670fc9f8cb1b495a2f62eb953d26113cfa3562f76b340b'
    ;;
  *)
    echo "Unsupported architecture for Gitleaks: $(uname -m)" >&2
    exit 1
    ;;
esac

archive_name="gitleaks_${gitleaks_version}_linux_${gitleaks_arch}.tar.gz"
download_url="https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/${archive_name}"
mkdir -p "$gitleaks_cache_dir"

exec 9>"$cache_root/gitleaks/.install.lock"
flock 9

if [[ ! -x "$gitleaks_bin" ]] ||
  ! printf '%s  %s\n' "$binary_sha256" "$gitleaks_bin" | sha256sum -c --status; then
  temporary_archive="$(mktemp "$gitleaks_cache_dir/.gitleaks-archive.XXXXXX")"
  temporary_bin="$(mktemp "$gitleaks_cache_dir/.gitleaks-bin.XXXXXX")"
  cleanup() {
    if [[ -n "${temporary_archive:-}" && -e "$temporary_archive" ]]; then
      unlink "$temporary_archive"
    fi
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
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --connect-timeout 20 \
    --max-time 180 \
    --output "$temporary_archive" \
    "$download_url"
  printf '%s  %s\n' "$archive_sha256" "$temporary_archive" | sha256sum -c --status

  tar -xOzf "$temporary_archive" gitleaks >"$temporary_bin"
  printf '%s  %s\n' "$binary_sha256" "$temporary_bin" | sha256sum -c --status
  chmod 755 "$temporary_bin"
  mv "$temporary_bin" "$gitleaks_bin"
  temporary_bin=''
fi

if [[ "$("$gitleaks_bin" version)" != "$gitleaks_version" ]]; then
  echo "Cached Gitleaks binary did not report version $gitleaks_version." >&2
  exit 1
fi

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$gitleaks_cache_dir" >>"$GITHUB_PATH"
fi

echo "Using checksum-verified Gitleaks $gitleaks_version from $gitleaks_bin" >&2
printf '%s\n' "$gitleaks_bin"
