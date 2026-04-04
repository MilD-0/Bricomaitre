#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_command curl
require_command tar

runner_token="${GITHUB_RUNNER_TOKEN:-}"
if [[ -z "$runner_token" ]]; then
  echo "GITHUB_RUNNER_TOKEN is required" >&2
  exit 1
fi

runner_dir="${GITHUB_RUNNER_DIR:-$HOME/actions-runner}"
runner_name="${GITHUB_RUNNER_NAME:-$(hostname)-bric-vps}"
runner_labels="${GITHUB_RUNNER_LABELS:-bric-vps}"
runner_workdir="${GITHUB_RUNNER_WORKDIR:-_work}"
repo_url="${GITHUB_RUNNER_REPO_URL:-$(git -C "$repo_root" remote get-url origin | sed -E 's#git@github.com:#https://github.com/#; s#\.git$##')}"

if [[ -z "$repo_url" ]]; then
  echo "unable to determine GitHub repository URL" >&2
  exit 1
fi

latest_runner_version="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p' | head -n1)"
if [[ -z "$latest_runner_version" ]]; then
  echo "unable to determine latest actions runner version" >&2
  exit 1
fi

runner_tarball="actions-runner-linux-x64-${latest_runner_version}.tar.gz"
runner_download_url="https://github.com/actions/runner/releases/download/v${latest_runner_version}/${runner_tarball}"

mkdir -p "$runner_dir"
cd "$runner_dir"

if [[ ! -x "$runner_dir/config.sh" ]]; then
  curl -fsSL -o "$runner_tarball" "$runner_download_url"
  tar xzf "$runner_tarball"
  rm -f "$runner_tarball"
fi

./config.sh \
  --url "$repo_url" \
  --token "$runner_token" \
  --name "$runner_name" \
  --labels "$runner_labels" \
  --work "$runner_workdir" \
  --unattended \
  --replace

if command -v sudo >/dev/null 2>&1; then
  sudo ./svc.sh install "$(whoami)"
  sudo ./svc.sh start
else
  ./run.sh &
fi

echo "runner configured:"
echo "  dir: $runner_dir"
echo "  name: $runner_name"
echo "  labels: $runner_labels"
echo "  repo: $repo_url"
