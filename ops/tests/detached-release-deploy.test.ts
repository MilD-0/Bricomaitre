import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceScript = resolve(workspaceRoot, 'ops/scripts/detached-release-deploy.sh');
const expectedCommit = 'a'.repeat(40);
const temporaryDirectories: string[] = [];

function createRelease(deployBody: string) {
  const releaseDirectory = mkdtempSync(join(tmpdir(), 'bric-detached-deploy-'));
  temporaryDirectories.push(releaseDirectory);
  const scriptDirectory = join(releaseDirectory, 'ops/scripts');
  mkdirSync(scriptDirectory, { recursive: true });

  const detachedScript = join(scriptDirectory, 'detached-release-deploy.sh');
  copyFileSync(sourceScript, detachedScript);
  chmodSync(detachedScript, 0o755);

  const deployScript = join(scriptDirectory, 'deploy.sh');
  writeFileSync(deployScript, `#!/usr/bin/env bash\nset -euo pipefail\n${deployBody}\n`);
  chmodSync(deployScript, 0o755);

  return { releaseDirectory, detachedScript };
}

function run(script: string, ...args: string[]) {
  return execFileSync('bash', [script, ...args], { encoding: 'utf8' }).trim();
}

async function waitForResult(script: string, releaseDirectory: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = run(script, 'status', releaseDirectory);
    if (state !== 'running') return state;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error('detached deploy did not record a result');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('detached release deploy', () => {
  it('records a successful deploy after its launching shell exits', async () => {
    const { releaseDirectory, detachedScript } = createRelease('echo "deploy output"\nsleep 0.1');

    expect(run(detachedScript, 'status', releaseDirectory)).toBe('missing');
    expect(run(detachedScript, 'start', releaseDirectory, expectedCommit)).toBe('started');
    expect(await waitForResult(detachedScript, releaseDirectory)).toBe('success');
    expect(run(detachedScript, 'logs', releaseDirectory, '20')).toContain('deploy output');
  });

  it('preserves a failed result instead of launching the same release again', async () => {
    const { releaseDirectory, detachedScript } = createRelease(
      'echo run >> "$1/runs"\necho "deploy failed"\nexit 23',
    );

    expect(run(detachedScript, 'start', releaseDirectory, expectedCommit)).toBe('started');
    expect(await waitForResult(detachedScript, releaseDirectory)).toBe('failure:23');
    expect(run(detachedScript, 'start', releaseDirectory, expectedCommit)).toBe('failure:23');
    expect(readFileSync(join(releaseDirectory, 'runs'), 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
