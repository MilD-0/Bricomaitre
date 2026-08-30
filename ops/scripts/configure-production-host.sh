#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
host_config_dir="$(cd "$script_dir/../host" && pwd -P)"
sysctl_target="/etc/sysctl.d/99-bricomaitre-redis.conf"
thp_unit_target="/etc/systemd/system/bricomaitre-disable-thp.service"
backup_cron_target="/etc/cron.d/bric-postgres-backup"
maintenance_logrotate_target="/etc/logrotate.d/bricomaitre-maintenance"
operations_user="${BRIC_OPERATIONS_USER:-${SUDO_USER:-deploy}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run this host configuration command as root" >&2
  exit 1
fi
if [[ ! "$operations_user" =~ ^[a-z_][a-z0-9_-]*\$?$ ]] || ! id "$operations_user" >/dev/null 2>&1; then
  echo "BRIC_OPERATIONS_USER must identify an existing system user" >&2
  exit 1
fi
operations_group="$(id -gn "$operations_user")"

install -m 0644 "$host_config_dir/99-bricomaitre-redis.conf" "$sysctl_target"
install -m 0644 "$host_config_dir/bricomaitre-disable-thp.service" "$thp_unit_target"
rendered_backup_cron="$(mktemp)"
rendered_maintenance_logrotate="$(mktemp)"
trap 'rm -f -- "$rendered_backup_cron" "$rendered_maintenance_logrotate"' EXIT
sed "s/{{OPERATIONS_USER}}/$operations_user/g" "$host_config_dir/bricomaitre-backups.cron" \
  >"$rendered_backup_cron"
install -m 0644 "$rendered_backup_cron" "$backup_cron_target"
sed \
  -e "s/{{OPERATIONS_USER}}/$operations_user/g" \
  -e "s/{{OPERATIONS_GROUP}}/$operations_group/g" \
  "$host_config_dir/bricomaitre-maintenance.logrotate" \
  >"$rendered_maintenance_logrotate"
install -m 0644 "$rendered_maintenance_logrotate" "$maintenance_logrotate_target"
rm -f -- "$rendered_backup_cron" "$rendered_maintenance_logrotate"
trap - EXIT
touch /var/log/bric-postgres-backup.log /var/log/bric-postgres-restore.log
chown "$operations_user:$operations_group" \
  /var/log/bric-postgres-backup.log \
  /var/log/bric-postgres-restore.log
chmod 0640 /var/log/bric-postgres-backup.log /var/log/bric-postgres-restore.log

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

echo "Redis memory settings, bounded database backup drills, and maintenance log rotation are active and persistent."
