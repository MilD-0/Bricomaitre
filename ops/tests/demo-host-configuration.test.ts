import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

type DemoService = {
  cpus: string;
  environment?: Record<string, string>;
  mem_limit: string;
  memswap_limit: string;
  pids_limit: number;
  logging: { options: Record<string, string> };
  dns: string[];
  ports?: unknown[];
};

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
    expect(
      execFileSync('bash', ['demo', 'prepare'], {
        cwd: root,
        env: { ...environment, BRIC_DEMO_RUNTIME_DIR: runtime, LC_ALL: 'en_US.UTF-8' },
        stdio: 'pipe',
      }),
    ).toBeDefined();
    expect(readFileSync(join(runtime, 'compose.env'), 'utf8')).toEqual(hosted);
    expect(readFileSync(join(runtime, 'secrets.env'), 'utf8')).toEqual(secrets);
    const aiSettings =
      'AI_ENABLED=true\nAI_PROVIDER=experientiallabs\nEXPLABS_API_KEY=fixture-only\nAI_STOREFRONT_MODEL=gpt-5.6-luna\n';
    writeFileSync(join(runtime, 'ai.env'), aiSettings);
    prepare(runtime);
    prepare(runtime);
    for (const name of ['admin.env', 'storefront.env']) {
      expect(readFileSync(join(runtime, name), 'utf8')).toContain(aiSettings);
    }
    expect(readFileSync(join(runtime, 'storefront-api.env'), 'utf8')).not.toContain('fixture-only');
    expect(prepare(isolated)).toContain('DEMO_STOREFRONT_ORIGIN=http://127.0.0.1:3402');
    expect(readFileSync(join(isolated, 'admin.env'), 'utf8')).not.toContain('fixture-only');
    expect(readFileSync(join(runtime, 'compose.env'), 'utf8')).toEqual(hosted);
    const values = Object.fromEntries(
      secrets
        .trim()
        .split('\n')
        .map((line) => line.split('=')),
    );
    const admin = readFileSync(join(runtime, 'admin.env'), 'utf8');
    const reader = readFileSync(join(runtime, 'storefront-api.env'), 'utf8');
    expect(admin).toContain(`AWS_ACCESS_KEY_ID=${values.DEMO_S3_ADMIN_ACCESS_KEY}`);
    expect(reader).toContain(`AWS_ACCESS_KEY_ID=${values.DEMO_S3_READER_ACCESS_KEY}`);
    for (const env of [admin, reader]) {
      expect(env.includes(values.DEMO_S3_SECRET_KEY)).toBe(false);
    }
    const config = JSON.parse(
      execFileSync(
        'docker',
        [
          'compose',
          '--env-file',
          join(runtime, 'compose.env'),
          '-f',
          'ops/demo/compose.yml',
          'config',
          '--format',
          'json',
        ],
        { cwd: root, env: { ...environment, BRIC_DEMO_RUNTIME_DIR: runtime }, encoding: 'utf8' },
      ),
    );
    for (const [name, service] of Object.entries(config.services) as [string, DemoService][]) {
      expect(Number(service.cpus), name).toBeGreaterThan(0);
      expect(Number(service.mem_limit), name).toBeGreaterThan(0);
      expect(service.memswap_limit, name).toBe(service.mem_limit);
      expect(service.pids_limit, name).toBeGreaterThan(0);
      expect(service.logging.options['max-file'], name).toBe('3');
      expect(service.dns, name).toEqual(['127.0.0.1']);
      if (name !== 'gateway') expect(service.ports, name).toBeUndefined();
    }
    expect(config.services.gateway.ports).toHaveLength(6);
    expect(Number(config.services['admin-worker'].mem_limit)).toBe(1024 * 1024 * 1024);
    expect(config.services['admin-worker'].environment?.NODE_OPTIONS).toBe(
      '--max-old-space-size=512',
    );
  } finally {
    rmSync(runtime, { recursive: true });
    rmSync(isolated, { recursive: true });
  }
}, 30_000);
