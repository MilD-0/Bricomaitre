import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(workspaceRoot, path), 'utf8');

function serviceBlock(compose: string, service: string) {
  const start = compose.indexOf(`\n  ${service}:`);
  if (start < 0) throw new Error(`Missing Compose service: ${service}`);
  const remaining = compose.slice(start + service.length + 4);
  const nextMatch = /^  \S.*:$/m.exec(remaining);
  const end =
    nextMatch?.index == null ? compose.length : start + service.length + 4 + nextMatch.index;
  return compose.slice(start, end);
}

describe('self-contained demo runtime', () => {
  const compose = read('ops/demo/compose.yml');
  const launcher = read('demo');
  const historicalSeed = read('ops/demo/postgres/seed.sql');
  const liveSeed = read('ops/demo/postgres/live.sql');
  const historicalVerification = read('ops/demo/postgres/seed/99-verify.sql');
  const liveVerification = read('ops/demo/postgres/seed/99-live-verify.sql');

  it('keeps every dependency and process inside a dedicated Compose project', () => {
    expect(compose).toContain('name: bricomaitre-demo');
    for (const service of [
      'postgres',
      'redis',
      'object-storage',
      'object-storage-init',
      'mock-services',
      'migrations',
      'database-permissions',
      'seed',
      'live-seed',
      'storefront-api',
      'storefront-marketing-worker',
      'admin',
      'admin-worker',
      'storefront',
    ]) {
      expect(compose).toContain(`\n  ${service}:`);
    }

    expect(serviceBlock(compose, 'postgres')).toContain('shm_size: 512mb');
    expect(serviceBlock(compose, 'postgres')).not.toContain('\n    ports:');
    expect(serviceBlock(compose, 'redis')).not.toContain('\n    ports:');
    expect(compose).toContain('\n  postgres-data:');
    expect(compose).toContain('\n  redis-data:');
    expect(compose).toContain('\n  object-storage-data:');
    expect(serviceBlock(compose, 'storefront-api')).toContain(
      'storefront-api-cache:/app/apps/storefront-api/.next/cache',
    );
    expect(serviceBlock(compose, 'admin')).toContain('admin-cache:/app/apps/admin/.next/cache');
  });

  it('publishes only the six explicit loopback entry points', () => {
    const publishedPorts = [...compose.matchAll(/^\s+- (.+:\d+)$/gm)]
      .map((match) => match[1])
      .filter((entry) => entry.includes('${DEMO_'));

    expect(publishedPorts).toHaveLength(6);
    expect(publishedPorts.every((entry) => entry.startsWith('127.0.0.1:'))).toBe(true);
    expect(compose).not.toContain('0.0.0.0:${DEMO_');
  });

  it('builds a verified historical template before adding reset-relative activity', () => {
    for (const fragment of [
      '00-reset.sql',
      '10-reference.sql',
      '20-catalog.sql',
      '30-commerce.sql',
      '40-analytics.sql',
      '50-operations.sql',
      '99-verify.sql',
    ]) {
      expect(historicalSeed).toContain(`/seed/seed/${fragment}`);
    }
    expect(liveSeed).toContain('/seed/seed/90-live.sql');
    expect(liveSeed).toContain('/seed/seed/99-live-verify.sql');
    expect(serviceBlock(compose, 'live-seed')).toContain(
      'seed:\n        condition: service_completed_successfully',
    );
    expect(serviceBlock(compose, 'storefront-api')).toContain(
      'live-seed:\n        condition: service_completed_successfully',
    );
    expect(launcher).toContain('CREATE DATABASE bricomaitre_demo_template');
    expect(launcher).toContain('WITH TEMPLATE bricomaitre_demo_template');
    expect(launcher).toContain('datistemplate = true, datallowconn = false');
    expect(launcher).toContain("shobj_description(oid, 'pg_database')");
  });

  it('enforces the agreed catalog, commerce, analytics, and operations scale', () => {
    expect(historicalVerification).toContain('product_count <> 3884');
    expect(historicalVerification).toContain('catalog_image_count <> 9065');
    expect(historicalVerification).toContain('historical_orders <> 249000');
    expect(historicalVerification).toContain('historical_lines <> 996000');
    expect(historicalVerification).toContain('historical_shipments <> 199400');
    expect(historicalVerification).toContain(
      "metric = 'generated_historical_sessions') <> 12000000",
    );
    expect(historicalVerification).toContain("metric = 'generated_historical_events') <> 72000000");
    expect(historicalVerification).toContain('(SELECT count(*) FROM ai_runs) < 1700');
    expect(liveVerification).toContain('order_count <> 250800');
    expect(liveVerification).toContain('line_count <> 1003200');
    expect(liveVerification).toContain('shipment_count <> 200888');
    expect(liveVerification).toContain("id LIKE 'demo-live-session-%') <> 68400");
    expect(liveVerification).toContain("event_id LIKE 'demo-live-event-%') <> 410400");
    expect(liveVerification).toContain("session_id LIKE 'demo-live-session-%') <> 1260");
    expect(liveVerification).toContain('Web Vitals ratings are mechanically concentrated');
  });

  it('pins source revisions and checks every normalized data snapshot', () => {
    const sourceLock = JSON.parse(read('ops/demo/data/sources.lock.json')) as {
      sources: Record<string, { revision: string; sha256?: string; files?: unknown[] }>;
      tools: { duckdbImage: string };
    };
    const generatedManifest = JSON.parse(read('ops/demo/data/generated-manifest.json')) as {
      files: Record<string, { bytes: number; sha256: string }>;
    };
    const verifier = read('ops/demo/scripts/verify-generated-data.mjs');

    expect(Object.keys(sourceLock.sources)).toHaveLength(8);
    for (const source of Object.values(sourceLock.sources)) {
      expect(source.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(source.sha256 != null || source.files != null).toBe(true);
    }
    expect(sourceLock.tools.duckdbImage).toMatch(/@sha256:[a-f0-9]{64}$/);
    expect(Object.keys(generatedManifest.files)).toHaveLength(7);
    for (const entry of Object.values(generatedManifest.files)) {
      expect(entry.bytes).toBeGreaterThan(0);
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(verifier).toContain('does not match generated-manifest.json');
    expect(launcher).toContain('verify-generated-data.mjs');
  });

  it('requires exact locally hosted product images without fallback assets', () => {
    const imageRows = read('ops/demo/data/image-manifest.tsv').trim().split('\n');
    const productImageCounts = new Map<string, number>();
    for (const row of imageRows) {
      const [productKey, position, sourceUrl] = row.split('\t');
      expect(position).toMatch(/^[1-8]$/);
      expect(sourceUrl).toMatch(/^https:\/\//);
      productImageCounts.set(productKey, (productImageCounts.get(productKey) ?? 0) + 1);
    }

    expect(imageRows).toHaveLength(9065);
    expect(productImageCounts.size).toBe(3884);
    expect([...productImageCounts.values()].filter((count) => count === 1)).toHaveLength(2333);
    expect([...productImageCounts.values()].filter((count) => count >= 5)).toHaveLength(194);
    expect(read('ops/demo/scripts/prepare-catalog-images.mjs')).toContain(
      'catalog images failed; replace their products before seeding',
    );
    expect(historicalVerification).toContain("image NOT LIKE '%/bricomaitre-demo/catalog/%'");
    expect(compose).not.toContain('/seed-assets');
  });

  it('keeps AI offline while seeding representative assistant history', () => {
    expect(launcher).toContain("'AI_ENABLED=false'");
    expect(launcher).not.toContain('OPENAI_API_KEY=');
    expect(launcher).not.toContain('OPENROUTER_API_KEY=');
    expect(compose).toContain('target: web');
    expect(compose).toContain('target: worker');
    expect(compose).toContain('target: meta-worker');
  });

  it('uses the seeded operator identity for one-click admin access', () => {
    const demoAuth = read('apps/admin/lib/demo-auth.ts');
    const referenceSeed = read('ops/demo/postgres/seed/10-reference.sql');

    expect(demoAuth).toContain("const DEMO_USER_ID = 'demo-operator'");
    expect(demoAuth).toContain("const DEMO_USER_EMAIL = 'operator@demo.bricomaitre.invalid'");
    expect(referenceSeed).toContain(
      "('demo-operator', 'Nadia Benali', 'operator@demo.bricomaitre.invalid'",
    );
  });

  it('supports normal provider flows and deterministic failures', () => {
    const mocks = read('ops/demo/mock-services.mjs');
    for (const provider of ['ecotrack', 'meta', 'google', 'tiktok']) {
      expect(mocks).toContain(`return '${provider}'`);
    }
    for (const scenario of ['rate-limit', 'unavailable', 'malformed']) {
      expect(mocks).toContain(`scenario === '${scenario}'`);
    }
    expect(mocks).toContain("request.headers['x-demo-failure']");
    expect(mocks).toContain("url.searchParams.get('__demo_failure')");
  });

  it('keeps customer exports private while serving the catalog deliberately', () => {
    const policy = JSON.parse(read('ops/demo/object-storage/public-read-policy.json')) as {
      Statement: Array<{ Resource: string[] }>;
    };
    const resources = policy.Statement.flatMap((statement) => statement.Resource);
    const initializer = read('ops/demo/object-storage/init.sh');

    expect(resources).toContain('arn:aws:s3:::bricomaitre-demo/catalog/*');
    expect(resources).toContain('arn:aws:s3:::bricomaitre-demo/exports/products/*');
    expect(resources.some((resource) => resource.includes('exports/orders'))).toBe(false);
    expect(resources.some((resource) => resource.includes('bulletin'))).toBe(false);
    const directory = mkdtempSync(resolve(tmpdir(), 'bric-storage-test-'));
    const calls = resolve(directory, 'calls');
    try {
      execFileSync(
        'bash',
        [
          '-c',
          'mc() { printf "%s\\n" "$*" >> "$MC_CALLS"; }; source "$1" reset',
          'test',
          resolve(workspaceRoot, 'ops/demo/object-storage/init.sh'),
        ],
        {
          env: {
            ...process.env,
            MC_CALLS: calls,
            DEMO_S3_ACCESS_KEY: 'test-root',
            DEMO_S3_SECRET_KEY: 'test-root-secret',
            DEMO_S3_ADMIN_ACCESS_KEY: 'test-admin',
            DEMO_S3_ADMIN_SECRET_KEY: 'test-admin-secret',
            DEMO_S3_READER_ACCESS_KEY: 'test-reader',
            DEMO_S3_READER_SECRET_KEY: 'test-reader-secret',
          },
        },
      );
      const operations = readFileSync(calls, 'utf8').trim().split('\n');
      expect(operations.filter((operation) => operation.startsWith('rm '))).toEqual(
        ['products', 'brands', 'categories', 'assets', 'banners', 'bulletin', 'exports'].map(
          (prefix) => `rm --recursive --force demo/bricomaitre-demo/${prefix}/`,
        ),
      );
      expect(operations).toContain(
        'ilm rule add --expire-days 2 --prefix exports/ demo/bricomaitre-demo',
      );
      expect(operations).toContain('quota set demo/bricomaitre-demo --size 4GiB');
    } finally {
      rmSync(directory, { recursive: true });
    }
    expect(initializer).toContain('mirror --overwrite --remove /catalog-images');
  });

  it('offers a bounded operator entry point and six-hour reset timer', () => {
    expect(statSync(resolve(workspaceRoot, 'demo')).mode & 0o111).not.toBe(0);
    expect(read('.gitignore')).toContain('ops/demo/.runtime/');
    expect(read('.gitignore')).toContain('ops/demo/.cache/');
    expect(launcher).toContain('compose config --quiet');
    expect(launcher).toContain('destroy --yes');
    expect(launcher).toContain('flock 9');
    expect(launcher).toContain('OnUnitActiveSec=6h');
    expect(launcher).toContain('pause_reset_timer_if_installed');
    expect(launcher).toContain('resume_reset_timer_if_installed');
    expect(launcher).toContain('/__demo/reset');
    expect(launcher).toContain('/__demo/shipments');
    expect(launcher).toContain('compose up -d --wait postgres redis object-storage mock-services');
    expect(launcher).not.toContain('compose up --build -d');
  });
});
