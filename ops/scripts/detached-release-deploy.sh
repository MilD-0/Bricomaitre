#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
release_dir_input="${2:-}"

if [[ -z "$action" || -z "$release_dir_input" ]]; then
  echo "usage: $0 <start|status|logs|execute> <release-dir> [expected-commit|line-count]" >&2
  exit 64
fi

release_dir="$(cd "$release_dir_input" && pwd -P)"
script_path="$release_dir/ops/scripts/detached-release-deploy.sh"
deploy_script="$release_dir/ops/scripts/deploy.sh"
status_file="$release_dir/.bric-deploy.status"
pid_file="$release_dir/.bric-deploy.pid"
log_file="$release_dir/.bric-deploy.log"

read_status() {
  local status

  if [[ -f "$status_file" ]]; then
    status="$(cat "$status_file")"
    if [[ ! "$status" =~ ^[0-9]+$ ]]; then
      echo "invalid recorded deploy status: $status" >&2
      exit 1
    fi
    if [[ "$status" == 0 ]]; then
      printf 'success\n'
    else
      printf 'failure:%s\n' "$status"
    fi
    return
  fi

  if [[ ! -f "$pid_file" ]]; then
    printf 'missing\n'
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    printf 'orphaned\n'
    return
  fi
  if kill -0 "$pid" 2>/dev/null; then
    printf 'running\n'
  else
    printf 'orphaned\n'
  fi
}

case "$action" in
  start)
    expected_commit="${3:-}"
    if [[ ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
      echo 'expected commit must be a 40-character lowercase Git SHA' >&2
      exit 64
    fi

    state="$(read_status)"
    if [[ "$state" != missing ]]; then
      printf '%s\n' "$state"
      exit 0
    fi

    : >"$log_file"
    nohup bash "$script_path" execute "$release_dir" "$expected_commit" \
      </dev/null >/dev/null 2>&1 &
    printf '%s\n' "$!" >"$pid_file"
    printf 'started\n'
    ;;
  status)
    read_status
    ;;
  logs)
    line_count="${3:-200}"
    if [[ ! "$line_count" =~ ^[0-9]+$ ]] || (( line_count < 1 || line_count > 1000 )); then
      echo 'line count must be between 1 and 1000' >&2
      exit 64
    fi
    if [[ -f "$log_file" ]]; then
      tail -n "$line_count" "$log_file"
    fi
    ;;
  execute)
    expected_commit="${3:-}"
    if [[ ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
      exit 64
    fi

    if bash "$deploy_script" "$release_dir" "$expected_commit" >"$log_file" 2>&1; then
      deploy_status=0
    else
      deploy_status=$?
    fi
    status_tmp="${status_file}.tmp.$$"
    printf '%s\n' "$deploy_status" >"$status_tmp"
    mv "$status_tmp" "$status_file"
    rm -f "$pid_file"
    exit "$deploy_status"
    ;;
  *)
    echo "unsupported detached deploy action: $action" >&2
    exit 64
    ;;
esac
