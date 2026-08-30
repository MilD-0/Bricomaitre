#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=load-infra-env.sh
source "$script_dir/load-infra-env.sh"

runtime_dir="${BRIC_RUNTIME_DIR:-/srv/bric/runtime}"
deploy_state_file="${BRIC_DEPLOY_STATE_FILE:-$runtime_dir/blue-green.env}"
monitor_state_file="${BRIC_STOREFRONT_MEMORY_STATE_FILE:-$runtime_dir/storefront-memory-monitor.env}"
compose_project="${COMPOSE_PROJECT_NAME:-bricadmin}"
alert_percent="${BRIC_STOREFRONT_MEMORY_ALERT_PERCENT:-85}"
proc_root="${BRIC_PROC_ROOT:-/proc}"
cgroup_root="${BRIC_CGROUP_ROOT:-/sys/fs/cgroup}"

if [[ ! "$alert_percent" =~ ^[1-9][0-9]?$|^100$ ]]; then
  echo 'BRIC_STOREFRONT_MEMORY_ALERT_PERCENT must be an integer from 1 to 100' >&2
  exit 64
fi
if [[ ! -f "$deploy_state_file" ]]; then
  echo "Storefront memory monitor cannot read deploy state: $deploy_state_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$deploy_state_file"
active_slot="${BRIC_ACTIVE_SLOT:-}"
if [[ "$active_slot" != blue && "$active_slot" != green ]]; then
  echo "Storefront memory monitor found an invalid active slot: ${active_slot:-<empty>}" >&2
  exit 1
fi

service="storefront-$active_slot"
mapfile -t container_ids < <(
  docker ps \
    --filter "label=com.docker.compose.project=$compose_project" \
    --filter "label=com.docker.compose.service=$service" \
    --format '{{.ID}}'
)
if ((${#container_ids[@]} != 1)); then
  echo "Storefront memory monitor expected one running $service container, found ${#container_ids[@]}" >&2
  exit 1
fi
container_id="${container_ids[0]}"

IFS='|' read -r container_name oom_killed restart_count container_pid memory_limit < <(
  docker inspect --format '{{.Name}}|{{.State.OOMKilled}}|{{.RestartCount}}|{{.State.Pid}}|{{.HostConfig.Memory}}' "$container_id"
)
container_name="${container_name#/}"
if [[ ! "$restart_count" =~ ^[0-9]+$ || ! "$container_pid" =~ ^[1-9][0-9]*$ || ! "$memory_limit" =~ ^[1-9][0-9]*$ ]]; then
  echo "Storefront memory monitor received invalid Docker memory metadata" >&2
  exit 1
fi

cgroup_path="$(awk -F: '$1 == "0" { print $3; exit }' "$proc_root/$container_pid/cgroup")"
memory_current_file="$cgroup_root$cgroup_path/memory.current"
memory_events_file="$cgroup_root$cgroup_path/memory.events"
if [[ -z "$cgroup_path" || ! -r "$memory_current_file" || ! -r "$memory_events_file" ]]; then
  echo "Storefront memory monitor cannot read cgroup v2 counters for $container_name" >&2
  exit 1
fi
memory_current="$(<"$memory_current_file")"
oom_kill_count="$(awk '$1 == "oom_kill" { print $2; exit }' "$memory_events_file")"
if [[ ! "$memory_current" =~ ^[0-9]+$ || ! "$oom_kill_count" =~ ^[0-9]+$ ]]; then
  echo "Storefront memory monitor received invalid cgroup memory counters" >&2
  exit 1
fi
memory_percent="$((memory_current * 100 / memory_limit))"

previous_container_id=""
previous_restart_count=0
previous_oom_kill_count=0
if [[ -f "$monitor_state_file" ]]; then
  # shellcheck disable=SC1090
  source "$monitor_state_file"
  previous_container_id="${BRIC_MONITORED_CONTAINER_ID:-}"
  previous_restart_count="${BRIC_MONITORED_RESTART_COUNT:-0}"
  previous_oom_kill_count="${BRIC_MONITORED_OOM_KILL_COUNT:-0}"
fi

alerts=()
if [[ "$oom_killed" == true ]]; then
  alerts+=("Docker marked the active Storefront container OOM-killed")
fi
if [[ "$previous_container_id" == "$container_id" ]]; then
  if ((restart_count > previous_restart_count)); then
    alerts+=("Storefront restart count increased from $previous_restart_count to $restart_count")
  fi
  if ((oom_kill_count > previous_oom_kill_count)); then
    alerts+=("Storefront cgroup OOM-kill count increased from $previous_oom_kill_count to $oom_kill_count")
  fi
elif ((oom_kill_count > 0)); then
  alerts+=("New active Storefront container already reports $oom_kill_count cgroup OOM kill(s)")
fi
if ((memory_percent >= alert_percent)); then
  alerts+=("Storefront memory usage is ${memory_percent}% (threshold ${alert_percent}%)")
fi

mkdir -p "$(dirname "$monitor_state_file")"
state_tmp="$(mktemp "${monitor_state_file}.tmp.XXXXXX")"
trap 'rm -f -- "$state_tmp"' EXIT
printf 'BRIC_MONITORED_CONTAINER_ID=%q\n' "$container_id" >"$state_tmp"
printf 'BRIC_MONITORED_RESTART_COUNT=%q\n' "$restart_count" >>"$state_tmp"
printf 'BRIC_MONITORED_OOM_KILL_COUNT=%q\n' "$oom_kill_count" >>"$state_tmp"
chmod 0600 "$state_tmp"
mv -- "$state_tmp" "$monitor_state_file"
trap - EXIT

if ((${#alerts[@]} > 0)); then
  message="Storefront memory alert: $(IFS='; '; echo "${alerts[*]}")"
  logger --priority daemon.alert --tag bricomaitre-storefront-memory -- "$message"
  echo "$message" >&2
  exit 1
fi

printf 'Storefront memory healthy: container=%s usage=%s%% restarts=%s oom_kills=%s\n' \
  "$container_name" "$memory_percent" "$restart_count" "$oom_kill_count"
