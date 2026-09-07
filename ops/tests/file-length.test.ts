import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const checker = resolve(import.meta.dirname, '../scripts/check-file-length.mjs');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it('checks tracked and new source files at the physical line boundary, including tests', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'bric-file-length-'));
  directories.push(cwd);
  execFileSync('git', ['init', '--quiet'], { cwd });
  writeFileSync(resolve(cwd, 'tracked.ts'), 'x\n'.repeat(500));
  execFileSync('git', ['add', 'tracked.ts'], { cwd });
  writeFileSync(resolve(cwd, 'new.test.tsx'), 'x\n'.repeat(499) + 'x');
  writeFileSync(resolve(cwd, 'schema.sql'), 'x\n'.repeat(1000));
  writeFileSync(resolve(cwd, '.gitignore'), 'ignored.ts\n');
  writeFileSync(resolve(cwd, 'ignored.ts'), 'x\n'.repeat(1000));
  expect(spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' }).status).toBe(0);

  writeFileSync(resolve(cwd, 'new.test.tsx'), 'x\n'.repeat(500) + 'x');
  const failure = spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' });
  expect(failure.status).toBe(1);
  expect(failure.stderr).toContain('new.test.tsx: 501 lines');
  expect(failure.stderr).not.toContain('schema.sql');
  expect(failure.stderr).not.toContain('ignored.ts');

  rmSync(resolve(cwd, 'tracked.ts'));
  rmSync(resolve(cwd, 'new.test.tsx'));
  expect(spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' }).status).toBe(0);
});
