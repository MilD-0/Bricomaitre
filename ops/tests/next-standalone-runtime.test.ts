import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hydrator = resolve(workspaceRoot, 'ops/scripts/hydrate-next-standalone.sh');
const standaloneLauncher = resolve(workspaceRoot, 'ops/scripts/start-next-standalone.mjs');
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
  it('loads app-local production environment files before starting the traced server', () => {
    const { appDirectory } = makeFixture();
    const serverDirectory = join(appDirectory, '.next/standalone/apps/fixture');
    mkdirSync(serverDirectory, { recursive: true });
    mkdirSync(join(appDirectory, '.next/static'));
    mkdirSync(join(appDirectory, 'public'));
    writeFileSync(join(appDirectory, '.env'), 'BRIC_LAUNCHER_TEST_VALUE=base\n');
    writeFileSync(join(appDirectory, '.env.local'), 'BRIC_LAUNCHER_TEST_VALUE=local\n');
    writeFileSync(
      join(appDirectory, '.env.production.local'),
      'BRIC_LAUNCHER_TEST_VALUE=production-local\nBRIC_LAUNCHER_TEST_OVERRIDE=file\n',
    );
    writeFileSync(
      join(serverDirectory, 'server.js'),
      `
      const { existsSync } = require('node:fs');
      console.log(JSON.stringify({
        value: process.env.BRIC_LAUNCHER_TEST_VALUE,
        override: process.env.BRIC_LAUNCHER_TEST_OVERRIDE,
        assets: existsSync(__dirname + '/public') && existsSync(__dirname + '/.next/static')
      }));
      process.exit(7);
    `,
    );
    const result = spawnSync(
      process.execPath,
      [
        standaloneLauncher,
        '--app-dir',
        appDirectory,
        '--nested-dir',
        'apps/fixture',
        '--default-port',
        '3030',
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, BRIC_LAUNCHER_TEST_OVERRIDE: 'process' },
      },
    );
    expect(result.status, result.stderr).toBe(7);
    expect(JSON.parse(result.stdout)).toEqual({
      value: 'production-local',
      override: 'process',
      assets: true,
    });
  });

  it.each(['admin', 'storefront-api', 'storefront'])(
    'hydrates the %s standalone tree before local production start',
    (app) => {
      const packageJson = JSON.parse(
        readFileSync(join(workspaceRoot, 'apps', app, 'package.json'), 'utf8'),
      ) as { scripts?: { start?: string } };

      expect(packageJson.scripts?.start).toContain(`hydrate-next-standalone.sh apps/${app}`);
      expect(packageJson.scripts?.start).toContain('start-next-standalone.mjs');
    },
  );

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
