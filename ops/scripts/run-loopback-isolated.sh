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

exec unshare --user --map-root-user --net -- \
  bash -c 'set -euo pipefail; ip link set lo up; exec "$@"' bash "$@"
