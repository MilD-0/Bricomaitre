import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// Execute the real installer. Only host effects are redirected into this test's
// temporary root; its rendering, sequencing, checks and failure handling run.
function installHost(failure = '') {
  const directory = mkdtempSync(join(tmpdir(), 'bric-host-install-'));
  const environment = join(directory, 'shell-environment');
  writeFileSync(
    environment,
    `
record() { printf '%s\n' "$*" >> "$HOST_TEST_ROOT/commands"; }
mapped() {
  case "$1" in
    /etc/*|/usr/local/libexec/bricomaitre*|/var/log/bric-*) printf '%s%s' "$HOST_TEST_ROOT" "$1" ;;
    *) echo 'unexpected installation target' >&2; return 90 ;;
  esac
}
id() {
  case "$1" in -u) echo 0 ;; -gn) echo operators ;; operator) return 0 ;; *) return 1 ;; esac
}
function /usr/sbin/dockerd() {
  record "dockerd $*"
  [[ "$HOST_TEST_FAILURE" != validate ]] || return 42
}
function /usr/sbin/sshd() {
  record "sshd $*"
  if [[ "$1" = -T ]]; then printf '%s\n' 'disableforwarding yes' 'allowagentforwarding no' 'allowtcpforwarding no' 'x11forwarding no'; fi
}
install() {
  record "install $*"
  local args=("$@") target
  target="$(mapped "\${args[-1]}")" || return
  args[-1]="$target"
  command mkdir -p "$(dirname "$target")"
  command install "\${args[@]}"
}
touch() {
  local file
  for file in "$@"; do
    file="$(mapped "$file")" || return
    command mkdir -p "$(dirname "$file")"
    command touch "$file"
  done
}
chown() { record "chown $*"; }
chmod() {
  local mode="$1" file; shift
  for file in "$@"; do command chmod "$mode" "$(mapped "$file")"; done
}
sysctl() { record "sysctl $*"; [[ -f "$(mapped "$2")" ]]; }
systemctl() { record "systemctl $*"; }
cat() {
  if [[ "$1" = /proc/sys/vm/overcommit_memory ]]; then echo 1; else command cat "$@"; fi
}
grep() {
  if [[ "\${*: -1}" = /sys/kernel/mm/transparent_hugepage/enabled ]]; then return 0; else command grep "$@"; fi
}
docker() {
  record "docker $*"
  if [[ "$HOST_TEST_FAILURE" = live-restore ]]; then echo false; else echo true; fi
}
`,
  );
  const result = spawnSync('bash', ['ops/scripts/configure-production-host.sh'], {
    cwd: resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      BASH_ENV: environment,
      HOST_TEST_ROOT: directory,
      HOST_TEST_FAILURE: failure,
      BRIC_OPERATIONS_USER: 'operator',
      TMPDIR: directory,
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { directory, result, read: (path: string) => readFileSync(join(directory, path), 'utf8') };
}

it('installs rendered host files with their modes and activates them after validation', () => {
  const run = installHost();
  try {
    expect(run.result.error).toBeUndefined();
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.read('etc/sysctl.d/99-bricomaitre-redis.conf')).toContain(
      'vm.overcommit_memory = 1',
    );
    expect(JSON.parse(run.read('etc/docker/daemon.json'))['live-restore']).toBe(true);
    expect(run.read('etc/cron.d/bric-postgres-backup')).toContain('operator');
    expect(run.read('etc/cron.d/bric-postgres-backup')).not.toContain('{{OPERATIONS_USER}}');
    expect(run.read('etc/logrotate.d/bricomaitre-maintenance')).toContain(
      'create 0640 operator operators',
    );
    expect(run.read('etc/systemd/system/bricomaitre-storefront-memory.service')).toContain(
      'User=operator',
    );
    expect(run.read('etc/systemd/system/bricomaitre-storefront-memory.service')).toContain(
      'Group=operators',
    );
    expect(run.read('etc/ssh/sshd_config.d/00-bricomaitre-hardening.conf')).toContain(
      'DisableForwarding yes',
    );
    for (const path of ['var/log/bric-postgres-backup.log', 'var/log/bric-postgres-restore.log']) {
      expect(statSync(join(run.directory, path)).mode & 0o777).toBe(0o640);
    }
    expect(
      statSync(join(run.directory, 'usr/local/libexec/bricomaitre/check-storefront-memory.sh'))
        .mode & 0o777,
    ).toBe(0o755);
    const commands = run.read('commands');
    expect(commands.indexOf('dockerd --validate')).toBeLessThan(commands.indexOf('install -m'));
    expect(commands.indexOf('sshd -t -f')).toBeLessThan(commands.indexOf('install -m'));
    const activation = [
      'systemctl daemon-reload',
      'systemctl enable --now bricomaitre-disable-thp.service',
      'systemctl enable --now bricomaitre-storefront-memory.timer',
      'systemctl reload docker',
      'systemctl reload ssh',
      'systemctl start bricomaitre-storefront-memory.service',
    ];
    let previous = commands.indexOf('sysctl -p');
    for (const command of activation) {
      const index = commands.indexOf(command);
      expect(index, command).toBeGreaterThan(previous);
      previous = index;
    }
    expect(commands).toContain(
      'chown operator:operators /var/log/bric-postgres-backup.log /var/log/bric-postgres-restore.log',
    );
    expect(run.result.stdout).toContain('active and persistent');
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

it('stops before installation when validation fails and rejects an unapplied live setting', () => {
  for (const failure of ['validate', 'live-restore']) {
    const run = installHost(failure);
    try {
      expect(run.result.status).toBe(failure === 'validate' ? 42 : 1);
      if (failure === 'validate') {
        expect(existsSync(join(run.directory, 'etc'))).toBe(false);
        expect(run.read('commands')).not.toContain('systemctl');
      } else {
        expect(run.result.stderr).toContain('Docker live-restore was not applied');
        expect(run.result.stdout).not.toContain('active and persistent');
      }
    } finally {
      rmSync(run.directory, { recursive: true, force: true });
    }
  }
});
