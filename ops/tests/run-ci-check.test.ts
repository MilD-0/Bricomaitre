import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runner = resolve(workspaceRoot, 'ops/scripts/run-ci-check.sh');

function runCheck(command: string) {
  const directory = mkdtempSync(join(tmpdir(), 'bric-ci-check-'));
  const summary = join(directory, 'summary.md');
  const result = spawnSync('bash', [runner, 'Synthetic check', 'bash', '-c', command], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
  });

  try {
    return { ...result, summary: readFileSync(summary, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('GitHub Actions check runner', () => {
  it('records and returns a successful command', () => {
    const result = runCheck('exit 0');

    expect(result.status).toBe(0);
    expect(result.summary).toContain('✅ Synthetic check');
  });

  it('fails the workflow step with the original command status', () => {
    const result = runCheck('exit 23');

    expect(result.status).toBe(23);
    expect(result.summary).toContain('❌ Synthetic check');
  });
});
