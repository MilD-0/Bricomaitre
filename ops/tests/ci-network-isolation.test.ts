import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const serviceRunner = resolve(workspaceRoot, 'ops/scripts/run-with-ci-services.sh');
const loopbackRunner = resolve(workspaceRoot, 'ops/scripts/run-loopback-isolated.sh');
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-ci-network-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runServiceCommand(commandExit = 0, coldCache = false, serviceFailure = false) {
  const directory = makeTemporaryDirectory();
  const logFile = join(directory, 'docker.log');
  const commandFile = join(directory, 'command.log');

  writeFileSync(
    join(directory, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ "$FAKE_COLD_CACHE" == 'true' ]]; then
    key='postgres'
    [[ "$3" == redis:* ]] && key='redis'
    [[ -f "$FAKE_STATE_DIR/$key" ]]
  fi
  exit 0
fi
if [[ "$1" == 'pull' ]]; then
  key='postgres'
  [[ "$2" == redis:* ]] && key='redis'
  touch "$FAKE_STATE_DIR/$key"
  exit 0
fi
if [[ "$1" == 'inspect' ]]; then
  if [[ "$FAKE_SERVICE_FAILURE" == 'true' && "$*" == *'bricomaitre-ci-redis-'* ]]; then
    echo 'running=false exit=1 oom=false error='
  else
    echo 'running=true exit=0 oom=false error='
  fi
  exit 0
fi
if [[ "$1" == 'logs' ]]; then
  echo 'synthetic service startup failure' >&2
  exit 0
fi
if [[ "$1" == 'exec' && "$*" == *'redis-cli'* ]]; then
  echo PONG
fi
exit 0
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    'bash',
    [
      serviceRunner,
      '55432',
      '56379',
      'bricomaitre_test',
      'bash',
      '-c',
      'printf "%s|%s|%s|%s\n" "$BRIC_CI_POSTGRES_CONTAINER" "$BRIC_CI_POSTGRES_PORT" "$BRIC_CI_REDIS_CONTAINER" "$BRIC_CI_REDIS_PORT" >> "$FAKE_COMMAND_LOG"; exit "$FAKE_COMMAND_EXIT"',
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        BRIC_CI_CACHE_DIR: directory,
        FAKE_COLD_CACHE: String(coldCache),
        FAKE_COMMAND_EXIT: String(commandExit),
        FAKE_COMMAND_LOG: commandFile,
        FAKE_DOCKER_LOG: logFile,
        FAKE_SERVICE_FAILURE: String(serviceFailure),
        FAKE_STATE_DIR: directory,
      },
    },
  );

  return {
    ...result,
    commandLog: existsSync(commandFile) ? readFileSync(commandFile, 'utf8') : '',
    dockerLog: readFileSync(logFile, 'utf8'),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('self-hosted CI network isolation', () => {
  it('reuses warm service images and avoids Docker bridge interfaces', () => {
    const result = runServiceCommand();

    expect(result.status).toBe(0);
    expect(result.commandLog).toMatch(
      /^bricomaitre-ci-postgres-.+\|55432\|bricomaitre-ci-redis-.+\|56379$/m,
    );
    expect(result.dockerLog).not.toContain('pull ');
    expect(result.dockerLog.match(/run --detach --init --network host/g)).toHaveLength(2);
    expect(result.dockerLog.match(/rm --force bricomaitre-ci-/g)).toHaveLength(2);
  });

  it('pulls each pinned image once on a cold host and preserves command failure', () => {
    const result = runServiceCommand(17, true);

    expect(result.status).toBe(17);
    expect(result.dockerLog.match(/^pull /gm)).toHaveLength(2);
    expect(result.dockerLog.match(/rm --force bricomaitre-ci-/g)).toHaveLength(2);
  });

  it('reports a stopped service immediately and still removes its retained container', () => {
    const result = runServiceCommand(0, false, true);

    expect(result.status).toBe(1);
    expect(result.commandLog).toBe('');
    expect(result.stderr).toContain(
      'Redis CI service stopped before becoming ready: running=false exit=1 oom=false',
    );
    expect(result.stderr).toContain('synthetic service startup failure');
    expect(result.dockerLog.match(/run --detach --init --network host/g)).toHaveLength(1);
    expect(result.dockerLog.match(/rm --force bricomaitre-ci-/g)).toHaveLength(1);
  });

  it('runs loopback-only commands in a private user and network namespace', () => {
    const directory = makeTemporaryDirectory();
    const logFile = join(directory, 'namespace.log');
    const commandFile = join(directory, 'command.log');

    writeFileSync(
      join(directory, 'unshare'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_NAMESPACE_LOG"
while [[ "$1" != '--' ]]; do shift; done
shift
exec "$@"
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, 'ip'),
      `#!/usr/bin/env bash
printf 'ip %s\n' "$*" >> "$FAKE_NAMESPACE_LOG"
`,
      { mode: 0o755 },
    );

    const result = spawnSync(
      'bash',
      [loopbackRunner, 'bash', '-c', 'echo isolated > "$FAKE_COMMAND_LOG"'],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ''}`,
          FAKE_COMMAND_LOG: commandFile,
          FAKE_NAMESPACE_LOG: logFile,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(commandFile, 'utf8')).toBe('isolated\n');
    expect(readFileSync(logFile, 'utf8')).toContain('--user --map-root-user --net --');
    expect(readFileSync(logFile, 'utf8')).toContain('ip link set lo up');
  });
});
