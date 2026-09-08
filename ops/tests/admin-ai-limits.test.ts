import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

it('replaces deployed limits idempotently while preserving credentials and unrelated settings', () => {
  const root = resolve(import.meta.dirname, '../..');
  const dir = mkdtempSync(join(tmpdir(), 'bric-admin-limits-'));
  const target = join(dir, 'admin.env');
  const preserved =
    '# operator settings\nOPENROUTER_API_KEY=fixture-only\nAI_ADMIN_MODEL=custom\nAI_REQUEST_TIMEOUT_MS=12345\n';
  try {
    writeFileSync(target, `${preserved}AI_ADMIN_MAX_STEPS=2\nAI_ADMIN_MAX_STEPS=3\n`);
    const apply = () =>
      execFileSync('bash', ['ops/scripts/apply-admin-ai-limits.sh', target], { cwd: root });
    apply();
    const result = readFileSync(target, 'utf8');
    expect(result).toBe(
      preserved + readFileSync(join(root, 'ops/env/admin-ai-limits.env'), 'utf8'),
    );
    expect(result).toContain('AI_ADMIN_MAX_STEPS=16\n');
    expect(statSync(target).mode & 0o777).toBe(0o600);
    apply();
    expect(readFileSync(target, 'utf8')).toBe(result);
    expect(() =>
      execFileSync('bash', ['ops/scripts/apply-admin-ai-limits.sh', join(dir, 'missing')], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
