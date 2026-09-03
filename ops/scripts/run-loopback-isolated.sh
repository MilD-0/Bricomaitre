#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo 'usage: run-loopback-isolated.sh <command> [args...]' >&2
  exit 64
fi

if ! command -v unshare >/dev/null 2>&1 || ! command -v ip >/dev/null 2>&1; then
  echo 'run-loopback-isolated.sh requires unshare and ip.' >&2
  exit 1
fi

if [[ "${RUNNER_ENVIRONMENT:-}" == 'github-hosted' ]]; then
  runner_uid="$(id -u)"
  runner_gid="$(id -g)"
  runner_home="$HOME"
  runner_path="$PATH"
  exec sudo --preserve-env unshare --net -- \
    bash -c 'set -euo pipefail; export HOME="$3" PATH="$4"; ip link set lo up; exec setpriv --reuid "$1" --regid "$2" --init-groups -- "${@:5}"' \
    bash "$runner_uid" "$runner_gid" "$runner_home" "$runner_path" "$@"
fi

exec unshare --user --map-root-user --net -- \
  bash -c 'set -euo pipefail; ip link set lo up; exec "$@"' bash "$@"
