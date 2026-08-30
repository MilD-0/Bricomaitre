import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const monitor = resolve(workspaceRoot, 'ops/scripts/check-storefront-memory.sh');
const temporaryDirectories: string[] = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-storefront-memory-'));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, 'bin');
  const procRoot = join(directory, 'proc');
  const cgroupRoot = join(directory, 'cgroup');
  const stateFile = join(directory, 'monitor.env');
  const deployStateFile = join(directory, 'blue-green.env');
  const logFile = join(directory, 'alerts.log');
  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(join(procRoot, '4321'), { recursive: true });
  mkdirSync(join(cgroupRoot, 'test.slice'), { recursive: true });
  writeFileSync(deployStateFile, 'BRIC_ACTIVE_SLOT=blue\n');
  writeFileSync(join(procRoot, '4321/cgroup'), '0::/test.slice\n');
  writeFileSync(join(cgroupRoot, 'test.slice/memory.current'), '400\n');
  writeFileSync(
    join(cgroupRoot, 'test.slice/memory.events'),
    'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0\n',
  );
  writeFileSync(
    join(binDirectory, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  ps) printf '%s\n' synthetic-container ;;
  inspect) printf '/bricadmin-storefront-blue-1|%s|%s|4321|1000\n' "\${FAKE_OOM_KILLED:-false}" "\${FAKE_RESTART_COUNT:-0}" ;;
  *) echo "unexpected docker command" >&2; exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(binDirectory, 'logger'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_LOG_FILE"
`,
    { mode: 0o755 },
  );

  const run = (overrides: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [monitor], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
        BRIC_DEPLOY_STATE_FILE: deployStateFile,
        BRIC_STOREFRONT_MEMORY_STATE_FILE: stateFile,
        BRIC_PROC_ROOT: procRoot,
        BRIC_CGROUP_ROOT: cgroupRoot,
        BRIC_INFRA_ENV_FILE: join(directory, 'missing-infra.env'),
        FAKE_LOG_FILE: logFile,
        ...overrides,
      },
    });

  return { cgroupRoot, logFile, run, stateFile };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Storefront memory monitor', () => {
  it('records a healthy baseline for the active Storefront container', () => {
    const test = fixture();
    const result = test.run();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('usage=40% restarts=0 oom_kills=0');
    expect(readFileSync(test.stateFile, 'utf8')).toContain(
      'BRIC_MONITORED_CONTAINER_ID=synthetic-container',
    );
  });

  it('alerts when the active cgroup OOM-kill counter increases', () => {
    const test = fixture();
    expect(test.run().status).toBe(0);
    writeFileSync(
      join(test.cgroupRoot, 'test.slice/memory.events'),
      'low 0\nhigh 0\nmax 1\noom 1\noom_kill 1\noom_group_kill 0\n',
    );

    const result = test.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OOM-kill count increased from 0 to 1');
    expect(readFileSync(test.logFile, 'utf8')).toContain('daemon.alert');
  });

  it('alerts on a restart increment and sustained high memory', () => {
    const test = fixture();
    expect(test.run().status).toBe(0);
    writeFileSync(join(test.cgroupRoot, 'test.slice/memory.current'), '900\n');

    const result = test.run({ FAKE_RESTART_COUNT: '1' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('restart count increased from 0 to 1');
    expect(result.stderr).toContain('memory usage is 90% (threshold 85%)');
  });
});
