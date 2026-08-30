import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const builder = resolve(workspaceRoot, 'ops/scripts/build-release-images.sh');
const temporaryDirectories: string[] = [];

function runBuilder(mode: 'transient-once' | 'always-transient' | 'build-error') {
  const directory = mkdtempSync(join(tmpdir(), 'bric-release-build-'));
  temporaryDirectories.push(directory);
  const fakeBin = join(directory, 'bin');
  const countFile = join(directory, 'calls');
  const metadataFile = join(directory, 'metadata.json');
  const logFile = join(directory, 'build.log');

  writeFileSync(
    join(directory, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "$FAKE_DOCKER_COUNT_FILE" ]]; then
  count="$(cat "$FAKE_DOCKER_COUNT_FILE")"
fi
count="$((count + 1))"
printf '%s\n' "$count" > "$FAKE_DOCKER_COUNT_FILE"
case "$FAKE_DOCKER_MODE" in
  transient-once)
    if ((count == 1)); then
      echo 'failed to resolve source metadata: dial tcp: i/o timeout' >&2
      exit 1
    fi
    ;;
  always-transient)
    echo 'TLS handshake timeout' >&2
    exit 1
    ;;
  build-error)
    echo 'Dockerfile syntax error' >&2
    exit 17
    ;;
esac
echo 'synthetic build succeeded'
`,
    { mode: 0o755 },
  );

  const result = spawnSync('bash', [builder, 'admin', metadataFile, logFile], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ''}`,
      FAKE_DOCKER_MODE: mode,
      FAKE_DOCKER_COUNT_FILE: countFile,
      BRIC_BUILD_MAX_ATTEMPTS: '3',
      BRIC_BUILD_RETRY_DELAY_SECONDS: '0',
    },
  });

  return {
    ...result,
    calls: Number(readFileSync(countFile, 'utf8').trim()),
    log: readFileSync(logFile, 'utf8'),
    fakeBin,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release image build retries', () => {
  it('retries a transient network failure and preserves the successful log', () => {
    const result = runBuilder('transient-once');

    expect(result.status).toBe(0);
    expect(result.calls).toBe(2);
    expect(result.stderr).toContain('transient network error; retrying');
    expect(result.log).toContain('synthetic build succeeded');
    expect(result.log).not.toContain('i/o timeout');
  });

  it('does not retry a deterministic build failure', () => {
    const result = runBuilder('build-error');

    expect(result.status).toBe(1);
    expect(result.calls).toBe(1);
    expect(result.stderr).toContain('non-network error; not retrying');
  });

  it('bounds repeated transient failures', () => {
    const result = runBuilder('always-transient');

    expect(result.status).toBe(1);
    expect(result.calls).toBe(3);
    expect(result.stderr).toContain('exhausted 3 transient-network attempts');
  });
});
