import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

it('keeps host origins and secrets across preparation without affecting another runtime', () => {
  const root = resolve(import.meta.dirname, '../..');
  const runtime = mkdtempSync(join(tmpdir(), 'bric-demo-host-test-'));
  const isolated = mkdtempSync(join(tmpdir(), 'bric-demo-build-test-'));
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('BRIC_DEMO_')),
  );
  const prepare = (directory: string) => {
    execFileSync('bash', ['demo', 'prepare'], {
      cwd: root,
      env: { ...environment, BRIC_DEMO_RUNTIME_DIR: directory },
      stdio: 'pipe',
    });
    return readFileSync(join(directory, 'compose.env'), 'utf8');
  };
  try {
    const local = prepare(runtime);
    const secrets = readFileSync(join(runtime, 'secrets.env'), 'utf8');
    writeFileSync(
      join(runtime, 'host.env'),
      'BRIC_DEMO_STOREFRONT_ORIGIN=https://shop.example.invalid\nBRIC_DEMO_OBJECT_ORIGIN=https://media.example.invalid\n',
    );
    const hosted = prepare(runtime);
    expect(hosted).toContain('DEMO_STOREFRONT_ORIGIN=https://shop.example.invalid');
    expect(hosted.match(/^DEMO_DATA_REVISION=.*$/m)?.[0]).not.toEqual(
      local.match(/^DEMO_DATA_REVISION=.*$/m)?.[0],
    );
    expect(prepare(runtime)).toEqual(hosted);
    expect(readFileSync(join(runtime, 'secrets.env'), 'utf8')).toEqual(secrets);
    expect(prepare(isolated)).toContain('DEMO_STOREFRONT_ORIGIN=http://127.0.0.1:3402');
    expect(readFileSync(join(runtime, 'compose.env'), 'utf8')).toEqual(hosted);
  } finally {
    rmSync(runtime, { recursive: true });
    rmSync(isolated, { recursive: true });
  }
}, 30_000);
