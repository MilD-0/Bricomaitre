#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
host_config_dir="$(cd "$script_dir/../host" && pwd -P)"
sysctl_target="/etc/sysctl.d/99-bricomaitre-redis.conf"
thp_unit_target="/etc/systemd/system/bricomaitre-disable-thp.service"
backup_cron_target="/etc/cron.d/bric-postgres-backup"
maintenance_logrotate_target="/etc/logrotate.d/bricomaitre-maintenance"
docker_daemon_target="/etc/docker/daemon.json"
ssh_hardening_target="/etc/ssh/sshd_config.d/00-bricomaitre-hardening.conf"
storefront_memory_service_target="/etc/systemd/system/bricomaitre-storefront-memory.service"
storefront_memory_timer_target="/etc/systemd/system/bricomaitre-storefront-memory.timer"
operations_libexec_dir="/usr/local/libexec/bricomaitre"
operations_user="${BRIC_OPERATIONS_USER:-${SUDO_USER:-codex}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run this host configuration command as root" >&2
  exit 1
fi
if [[ ! "$operations_user" =~ ^[a-z_][a-z0-9_-]*\$?$ ]] || ! id "$operations_user" >/dev/null 2>&1; then
  echo "BRIC_OPERATIONS_USER must identify an existing system user" >&2
  exit 1
fi
operations_group="$(id -gn "$operations_user")"

/usr/sbin/dockerd --validate --config-file "$host_config_dir/docker-daemon.json"
sshd_validation_config="$(mktemp)"
trap 'rm -f -- "$sshd_validation_config"' EXIT
printf 'Include %s\n' "$host_config_dir/00-bricomaitre-hardening.conf" >"$sshd_validation_config"
/usr/sbin/sshd -t -f "$sshd_validation_config"
rm -f -- "$sshd_validation_config"
trap - EXIT

install -m 0644 "$host_config_dir/99-bricomaitre-redis.conf" "$sysctl_target"
install -m 0644 "$host_config_dir/bricomaitre-disable-thp.service" "$thp_unit_target"
install -m 0644 "$host_config_dir/docker-daemon.json" "$docker_daemon_target"
install -m 0644 "$host_config_dir/00-bricomaitre-hardening.conf" "$ssh_hardening_target"
install -d -m 0755 "$operations_libexec_dir"
install -m 0755 "$script_dir/check-storefront-memory.sh" "$operations_libexec_dir/check-storefront-memory.sh"
install -m 0644 "$script_dir/load-infra-env.sh" "$operations_libexec_dir/load-infra-env.sh"
rendered_backup_cron="$(mktemp)"
rendered_maintenance_logrotate="$(mktemp)"
rendered_storefront_memory_service="$(mktemp)"
trap 'rm -f -- "$rendered_backup_cron" "$rendered_maintenance_logrotate" "$rendered_storefront_memory_service"' EXIT
sed "s/{{OPERATIONS_USER}}/$operations_user/g" "$host_config_dir/bricomaitre-backups.cron" \
  >"$rendered_backup_cron"
install -m 0644 "$rendered_backup_cron" "$backup_cron_target"
sed \
  -e "s/{{OPERATIONS_USER}}/$operations_user/g" \
  -e "s/{{OPERATIONS_GROUP}}/$operations_group/g" \
  "$host_config_dir/bricomaitre-maintenance.logrotate" \
  >"$rendered_maintenance_logrotate"
install -m 0644 "$rendered_maintenance_logrotate" "$maintenance_logrotate_target"
sed \
  -e "s/{{OPERATIONS_USER}}/$operations_user/g" \
  -e "s/{{OPERATIONS_GROUP}}/$operations_group/g" \
  "$host_config_dir/bricomaitre-storefront-memory.service" \
  >"$rendered_storefront_memory_service"
install -m 0644 "$rendered_storefront_memory_service" "$storefront_memory_service_target"
install -m 0644 \
  "$host_config_dir/bricomaitre-storefront-memory.timer" \
  "$storefront_memory_timer_target"
rm -f -- "$rendered_backup_cron" "$rendered_maintenance_logrotate" "$rendered_storefront_memory_service"
trap - EXIT
touch /var/log/bric-postgres-backup.log /var/log/bric-postgres-restore.log
chown "$operations_user:$operations_group" \
  /var/log/bric-postgres-backup.log \
  /var/log/bric-postgres-restore.log
chmod 0640 /var/log/bric-postgres-backup.log /var/log/bric-postgres-restore.log

sysctl -p "$sysctl_target"
systemctl daemon-reload
systemctl enable --now bricomaitre-disable-thp.service
systemctl enable --now bricomaitre-storefront-memory.timer
systemctl reload docker
/usr/sbin/sshd -t
systemctl reload ssh
systemctl start bricomaitre-storefront-memory.service

if [[ "$(cat /proc/sys/vm/overcommit_memory)" != "1" ]]; then
  echo "vm.overcommit_memory was not applied" >&2
  exit 1
fi
if ! grep -q '\[never\]' /sys/kernel/mm/transparent_hugepage/enabled; then
  echo "transparent huge pages remain enabled" >&2
  exit 1
fi
if [[ "$(docker info --format '{{.LiveRestoreEnabled}}')" != "true" ]]; then
  echo "Docker live-restore was not applied" >&2
  exit 1
fi
if /usr/sbin/sshd -T | grep -Eq \
  '^(allowagentforwarding yes|allowtcpforwarding yes|x11forwarding yes|disableforwarding no)$'; then
  echo "SSH forwarding hardening was not applied" >&2
  exit 1
fi

echo "Redis memory settings, Docker live-restore, SSH forwarding hardening, Storefront memory monitoring, bounded database backup drills, and maintenance log rotation are active and persistent."
