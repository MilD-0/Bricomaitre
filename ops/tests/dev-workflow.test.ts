import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  copyFileSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
// @ts-expect-error CLI modules run as plain Node JavaScript.
const state = await import('../dev/state.mjs');
// @ts-expect-error CLI modules run as plain Node JavaScript.
const verification = await import('../dev/verify.mjs');
const temporary: string[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'bric-dev-test-'));
  temporary.push(path);
  return path;
}
function repository() {
  const cwd = directory();
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init');
  git('config', 'user.email', 'qa@example.invalid');
  git('config', 'user.name', 'QA');
  writeFileSync(join(cwd, 'source.ts'), 'export const value = 1;\n');
  writeFileSync(join(cwd, '.gitignore'), 'runtime/\n');
  git('add', '.');
  git('commit', '-m', 'fixture');
  return { cwd, git };
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('task environment and verification contracts', () => {
  it('detects edits, new files and deletions without invalidating evidence for ignored runtime output', () => {
    const { cwd, git } = repository();
    const before = state.identity(cwd);
    mkdirSync(join(cwd, 'runtime'));
    writeFileSync(join(cwd, 'runtime/log'), 'changing runtime');
    expect(state.identity(cwd).fingerprint).toBe(before.fingerprint);
    writeFileSync(join(cwd, 'source.ts'), 'export const value = 2;\n');
    expect(state.identity(cwd).fingerprint).not.toBe(before.fingerprint);
    git('restore', 'source.ts');
    writeFileSync(join(cwd, 'new.ts'), 'new behavior');
    expect(verification.changedFiles('HEAD', cwd)).toEqual(['new.ts']);
    expect(state.identity(cwd).fingerprint).not.toBe(before.fingerprint);
    rmSync(join(cwd, 'new.ts'));
    rmSync(join(cwd, 'source.ts'));
    expect(state.identity(cwd).fingerprint).not.toBe(before.fingerprint);
    expect(verification.changedFiles('HEAD', cwd)).toEqual(['source.ts']);
  });
  it('keeps identity stable through a commit of the same content and resolves worktree aliases', () => {
    const { cwd, git } = repository();
    writeFileSync(join(cwd, 'source.ts'), 'changed');
    const before = state.identity(cwd);
    git('add', '.');
    git('commit', '-m', 'changed');
    expect(state.identity(cwd).fingerprint).toBe(before.fingerprint);
    expect(state.identity(cwd).commit).not.toBe(before.commit);
    const alias = join(directory(), 'alias');
    symlinkSync(cwd, alias);
    expect(state.projectFor(alias)).toBe(state.projectFor(cwd));
    expect(state.projectFor(directory())).not.toBe(state.projectFor(cwd));
  });
  it('reserves disjoint port blocks under concurrent allocation', async () => {
    const registry = directory();
    const allocations = await Promise.all([
      state.allocatePorts(registry),
      state.allocatePorts(registry),
    ]);
    const ports = allocations.flatMap((a) => Object.values(a));
    expect(new Set(ports).size).toBe(state.roles.length * 2);
  });
  it('fails a timed-out command even if its termination handler exits successfully', async () => {
    await expect(
      state.run(
        process.execPath,
        ['-e', "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],
        { timeout: 500 },
      ),
    ).rejects.toThrow(/interrupted|time limit/);
    expect(state.ownsProcess(process.pid, 'supervisor.mjs')).toBe(false);
  });
  it('keeps documentation cheap and includes all consumers for a shared change', () => {
    expect(
      verification.planFor(['docs/testing.md']).every((c: string[]) => c.includes('prettier')),
    ).toBe(true);
    const shared = verification.planFor(['packages/storefront-core/src/order-write.ts']);
    for (const app of ['admin', 'storefront', 'storefront-api'])
      expect(shared).toContainEqual(['pnpm', '--filter', `@bric/${app}`, 'test']);
    const admin = verification.planFor(['apps/admin/lib/orders.ts']);
    expect(admin.findIndex((c: string[]) => c.includes('test'))).toBeLessThan(
      admin.findIndex((c: string[]) => c.includes('test:integration')),
    );
    expect(admin.some((c: string[]) => c.includes('test:browser'))).toBe(false);
  });
  it('records command failures and invalidates success when source changes during the run', () => {
    const { cwd, git } = repository();
    mkdirSync(join(cwd, 'ops/dev'), { recursive: true });
    for (const file of ['cli.mjs', 'state.mjs', 'environment.mjs', 'verify.mjs'])
      copyFileSync(join(root, 'ops/dev', file), join(cwd, 'ops/dev', file));
    for (const app of ['admin', 'storefront-api', 'storefront'])
      mkdirSync(join(cwd, 'apps', app), { recursive: true });
    writeFileSync(join(cwd, '.gitignore'), 'ops/runtime/\n');
    git('add', '.');
    git('commit', '-m', 'runner');
    const execute = (code: string) =>
      execFileSync(
        process.execPath,
        ['ops/dev/cli.mjs', 'verify', '--', process.execPath, '-e', code],
        { cwd, stdio: 'pipe', timeout: 15000 },
      );
    expect(() => execute("console.error('meaningful failure');process.exit(7)")).toThrow();
    const evidence = join(cwd, 'ops/runtime/dev/evidence');
    let entries = readdirSync(evidence).sort();
    const failed = JSON.parse(readFileSync(join(evidence, entries[0], 'report.json'), 'utf8'));
    expect(failed.status).toBe('failed');
    expect(failed.checks[0].error).toContain('exited 7');
    expect(readFileSync(join(evidence, entries[0], '1.log'), 'utf8')).toContain(
      'meaningful failure',
    );
    expect(() =>
      execute("require('node:fs').writeFileSync('source.ts','changed during verification')"),
    ).toThrow();
    entries = readdirSync(evidence).sort();
    const invalidated = JSON.parse(readFileSync(join(evidence, entries[1], 'report.json'), 'utf8'));
    expect(invalidated.status).toBe('invalidated');
    expect(invalidated.checks[0].status).toBe('passed');
    expect(invalidated.sourceMatches).toBe(false);
    execute("console.log('verified')");
    entries = readdirSync(evidence).sort();
    expect(JSON.parse(readFileSync(join(evidence, entries[2], 'report.json'), 'utf8')).status).toBe(
      'passed',
    );
  });
});
