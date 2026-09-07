import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('clears inherited production services and upload credentials before verification builds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bric-build-verification-'));
  const root = resolve(import.meta.dirname, '../..');
  try {
    mkdirSync(join(directory, 'ops/scripts'), { recursive: true });
    mkdirSync(join(directory, 'apps/storefront/test'), { recursive: true });
    mkdirSync(join(directory, 'bin'));
    copyFileSync(
      join(root, 'ops/scripts/build-public-apps.sh'),
      join(directory, 'ops/scripts/build-public-apps.sh'),
    );
    for (const file of readdirSync(join(root, 'apps/storefront/test'))) {
      if (!file.startsWith('fixture-') || !file.endsWith('.mjs')) continue;
      copyFileSync(
        join(root, 'apps/storefront/test', file),
        join(directory, 'apps/storefront/test', file),
      );
    }
    cpSync(
      join(root, 'apps/storefront/test/fixtures'),
      join(directory, 'apps/storefront/test/fixtures'),
      { recursive: true },
    );
    writeFileSync(
      join(directory, 'bin/pnpm'),
      `#!/usr/bin/env node
      console.log(JSON.stringify({
        args: process.argv.slice(2),
        database: process.env.DATABASE_URL,
        redis: process.env.REDIS_URL,
        sentry: process.env.SENTRY_AUTH_TOKEN,
        origin: process.env.STOREFRONT_API_BASE_URL,
        release: process.env.NEXT_PUBLIC_RELEASE,
      }));
      process.exit(17);
    `,
      { mode: 0o755 },
    );
    const result = spawnSync('bash', [join(directory, 'ops/scripts/build-public-apps.sh')], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
        DATABASE_URL: 'postgresql://inherited.invalid/production',
        REDIS_URL: 'redis://inherited.invalid',
        SENTRY_AUTH_TOKEN: 'inherited-fixture',
        STOREFRONT_API_BASE_URL: 'https://inherited.invalid',
      },
    });
    expect(result.status, result.stderr).toBe(17);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ['build:apps'],
      database: '',
      redis: '',
      sentry: '',
      origin: 'http://127.0.0.1:4311',
      release: 'source-verification',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
