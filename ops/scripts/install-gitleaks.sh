#!/usr/bin/env bash
set -euo pipefail

gitleaks_version='8.30.1'
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
    archive_sha256='551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
    binary_sha256='88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509'
    ;;
  aarch64|arm64)
    gitleaks_arch='arm64'
    archive_sha256='e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'
    binary_sha256='00e91bbe655bd7c47753e8cfe61cb76ea1a5d7e7702fe161ee40102b46b3823b'
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
