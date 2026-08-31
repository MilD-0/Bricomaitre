import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const generator = resolve(workspaceRoot, 'ops/scripts/generate-runtime-license-bundle.mjs');

function writePackage(root: string, name: string, version: string, license?: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name, version, license: 'MIT' }, null, 2)}\n`,
  );
  if (license) writeFileSync(join(root, 'LICENSE'), license);
}

describe('runtime third-party license bundle', () => {
  it('uses pnpm source packages to restore notices pruned from runtime trees', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'bric-runtime-licenses-'));
    const runtime = join(fixture, 'runtime');
    const workspaceNodeModules = join(fixture, 'workspace-node_modules');
    const output = join(fixture, 'RUNTIME_THIRD_PARTY_LICENSES.txt');

    writePackage(join(runtime, 'node_modules/alpha'), 'alpha', '1.0.0');
    writePackage(join(runtime, 'node_modules/@scope/beta'), '@scope/beta', '2.0.0', 'Beta terms');
    writePackage(join(runtime, 'node_modules/@bric/internal'), '@bric/internal', '0.1.0');
    writePackage(
      join(workspaceNodeModules, '.pnpm/alpha@1.0.0/node_modules/alpha'),
      'alpha',
      '1.0.0',
      'Alpha terms',
    );

    execFileSync(process.execPath, [generator, workspaceNodeModules, output, runtime]);
    const bundle = readFileSync(output, 'utf8');

    expect(bundle).toContain('Packages covered: 2');
    expect(bundle).toContain('Package: alpha@1.0.0');
    expect(bundle).toContain('Alpha terms');
    expect(bundle).toContain('Package: @scope/beta@2.0.0');
    expect(bundle).toContain('Beta terms');
    expect(bundle).not.toContain('@bric/internal');
    expect(bundle.indexOf('@scope/beta@2.0.0')).toBeLessThan(bundle.indexOf('alpha@1.0.0'));
  });

  it('fails closed when a runtime dependency has no distributable notice', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'bric-runtime-licenses-missing-'));
    const runtime = join(fixture, 'runtime');
    const workspaceNodeModules = join(fixture, 'workspace-node_modules');
    const output = join(fixture, 'RUNTIME_THIRD_PARTY_LICENSES.txt');

    writePackage(join(runtime, 'node_modules/unlicensed'), 'unlicensed', '1.0.0');
    mkdirSync(join(workspaceNodeModules, '.pnpm'), { recursive: true });

    const result = spawnSync(process.execPath, [generator, workspaceNodeModules, output, runtime], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('- unlicensed@1.0.0');
  });
});
