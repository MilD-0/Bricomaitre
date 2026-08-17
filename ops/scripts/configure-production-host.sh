#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
host_config_dir="$(cd "$script_dir/../host" && pwd -P)"
sysctl_target="/etc/sysctl.d/99-bricomaitre-redis.conf"
thp_unit_target="/etc/systemd/system/bricomaitre-disable-thp.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run this host configuration command as root" >&2
  exit 1
fi

install -m 0644 "$host_config_dir/99-bricomaitre-redis.conf" "$sysctl_target"
install -m 0644 "$host_config_dir/bricomaitre-disable-thp.service" "$thp_unit_target"

sysctl -p "$sysctl_target"
systemctl daemon-reload
systemctl enable --now bricomaitre-disable-thp.service

if [[ "$(cat /proc/sys/vm/overcommit_memory)" != "1" ]]; then
  echo "vm.overcommit_memory was not applied" >&2
  exit 1
fi
if ! grep -q '\[never\]' /sys/kernel/mm/transparent_hugepage/enabled; then
  echo "transparent huge pages remain enabled" >&2
  exit 1
fi

echo "Redis host memory settings are active and persistent."
