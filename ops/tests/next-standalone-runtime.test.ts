import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hydrator = resolve(workspaceRoot, 'ops/scripts/hydrate-next-standalone.sh');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeFixture({ includeTarget = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'bric-next-standalone-'));
  temporaryDirectories.push(directory);
  const appDirectory = join(directory, 'app');
  const helpersSource = join(directory, 'helpers');
  const helpersTarget = join(
    appDirectory,
    '.next/standalone/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers',
  );
  mkdirSync(join(helpersSource, 'esm'), { recursive: true });
  writeFileSync(join(helpersSource, 'esm/_interop_require_default.js'), 'export default {}\n');
  writeFileSync(join(helpersSource, 'esm/_interop_require_wildcard.js'), 'export default {}\n');
  mkdirSync(
    includeTarget
      ? helpersTarget
      : join(appDirectory, '.next/standalone/node_modules/.pnpm/placeholder'),
    { recursive: true },
  );
  return { appDirectory, helpersSource, helpersTarget };
}

describe('Next standalone dependency hydration', () => {
  it('copies the complete SWC helper runtime into traced standalone targets', () => {
    const fixture = makeFixture();
    const result = spawnSync('bash', [hydrator, fixture.appDirectory], {
      encoding: 'utf8',
      env: { ...process.env, BRIC_SWC_HELPERS_SOURCE: fixture.helpersSource },
    });

    expect(result).toMatchObject({ status: 0 });
    expect(result.stdout).toContain('hydrated @swc/helpers in 1 Next standalone target(s)');
    expect(
      readFileSync(join(fixture.helpersTarget, 'esm/_interop_require_default.js'), 'utf8'),
    ).toContain('export default');
  });

  it('fails closed when the standalone trace has no SWC helper target', () => {
    const fixture = makeFixture({ includeTarget: false });
    const result = spawnSync('bash', [hydrator, fixture.appDirectory], {
      encoding: 'utf8',
      env: { ...process.env, BRIC_SWC_HELPERS_SOURCE: fixture.helpersSource },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('did not contain an @swc/helpers target');
  });
});
