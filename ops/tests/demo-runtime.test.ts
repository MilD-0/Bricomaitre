import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(workspaceRoot, path), 'utf8');

describe('self-contained demo runtime', () => {
  it('pins source revisions and checks every normalized data snapshot', () => {
    const sourceLock = JSON.parse(read('ops/demo/data/sources.lock.json')) as {
      sources: Record<string, { revision: string; sha256?: string; files?: unknown[] }>;
      tools: { duckdbImage: string };
    };
    const generatedManifest = JSON.parse(read('ops/demo/data/generated-manifest.json')) as {
      files: Record<string, { bytes: number; sha256: string }>;
    };

    execFileSync(process.execPath, ['ops/demo/scripts/verify-generated-data.mjs'], {
      cwd: workspaceRoot,
      stdio: 'pipe',
    });
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
  });

  it('keeps customer exports private while serving the catalog deliberately', () => {
    const policy = JSON.parse(read('ops/demo/object-storage/public-read-policy.json')) as {
      Statement: Array<{ Resource: string[] }>;
    };
    const resources = policy.Statement.flatMap((statement) => statement.Resource);

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
      expect(operations).toContain(
        'mirror --overwrite --remove /catalog-images demo/bricomaitre-demo/catalog',
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
