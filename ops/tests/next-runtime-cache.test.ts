import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error The production entrypoint is intentionally plain Node ESM
// so it can run before the standalone Next server without a transpiler.
import { pruneNextFetchCache } from '../scripts/prune-next-runtime-cache.mjs';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

function createCache() {
  const root = mkdtempSync(join(tmpdir(), 'bric-next-cache-'));
  const fetchCache = join(root, 'fetch-cache');
  mkdirSync(fetchCache);
  temporaryDirectories.push(root);
  return { root, fetchCache };
}

function cacheFile(directory: string, name: string, bytes: number, modifiedAt: number) {
  const file = join(directory, name);
  writeFileSync(file, Buffer.alloc(bytes, name));
  const timestamp = new Date(modifiedAt);
  utimesSync(file, timestamp, timestamp);
  return file;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Next runtime cache pruning', () => {
  it('removes expired entries, then evicts oldest entries to the byte ceiling', () => {
    const { root, fetchCache } = createCache();
    const now = Date.UTC(2026, 7, 26);
    cacheFile(fetchCache, 'expired', 7, now - 10_000);
    cacheFile(fetchCache, 'oldest', 6, now - 2_000);
    cacheFile(fetchCache, 'newest', 5, now - 1_000);

    const result = pruneNextFetchCache(root, { now, maxAgeSeconds: 5, maxBytes: 5 });

    expect(result).toEqual({ scanned: 3, removed: 2, removedBytes: 13, retainedBytes: 5 });
    expect(readFileSync(join(fetchCache, 'newest'))).toHaveLength(5);
  });

  it('is a no-op before Next creates the fetch cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'bric-next-cache-empty-'));
    temporaryDirectories.push(root);

    expect(pruneNextFetchCache(root)).toEqual({
      scanned: 0,
      removed: 0,
      removedBytes: 0,
      retainedBytes: 0,
    });
  });

  it('allows age pruning to be disabled while retaining the byte ceiling', () => {
    const { root, fetchCache } = createCache();
    const now = Date.UTC(2026, 7, 26);
    cacheFile(fetchCache, 'old', 4, now - 100_000);
    cacheFile(fetchCache, 'new', 3, now - 1_000);

    expect(pruneNextFetchCache(root, { now, maxAgeSeconds: 0, maxBytes: 10 })).toEqual({
      scanned: 2,
      removed: 0,
      removedBytes: 0,
      retainedBytes: 7,
    });
  });

  it('refuses a symlinked fetch cache instead of following it', () => {
    const root = mkdtempSync(join(tmpdir(), 'bric-next-cache-link-'));
    const target = mkdtempSync(join(tmpdir(), 'bric-next-cache-target-'));
    temporaryDirectories.push(root, target);
    symlinkSync(target, join(root, 'fetch-cache'));

    expect(() => pruneNextFetchCache(root)).toThrow(/non-directory fetch cache/);
  });

  it('packages pruning before the production Next process', () => {
    const dockerfile = readFileSync(
      resolve(workspaceRoot, 'ops/docker/Dockerfile.storefront'),
      'utf8',
    );

    expect(dockerfile).toContain(
      'COPY --chown=bric:bric ops/scripts/prune-next-runtime-cache.mjs ./prune-next-runtime-cache.mjs',
    );
    expect(dockerfile).toContain(
      'COPY --chown=bric:bric ops/scripts/run-storefront-with-cache-pruning.mjs ./run-storefront-with-cache-pruning.mjs',
    );
    expect(dockerfile).toContain(
      'CMD ["node", "/app/run-storefront-with-cache-pruning.mjs", "/app/apps/storefront/.next/cache", "node", "apps/storefront/server.js"]',
    );
  });

  it('reapplies the byte ceiling while the storefront process is running', () => {
    const { root, fetchCache } = createCache();
    const childScript = join(root, 'fake-storefront.mjs');
    const oversized = join(fetchCache, 'created-after-startup');
    writeFileSync(
      childScript,
      `import { existsSync, writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(oversized)}, Buffer.alloc(16));
setTimeout(() => process.exit(existsSync(${JSON.stringify(oversized)}) ? 1 : 0), 1500);
`,
    );

    const result = spawnSync(
      process.execPath,
      [
        resolve(workspaceRoot, 'ops/scripts/run-storefront-with-cache-pruning.mjs'),
        root,
        process.execPath,
        childScript,
      ],
      {
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          BRIC_NEXT_FETCH_CACHE_MAX_BYTES: '5',
          BRIC_NEXT_FETCH_CACHE_MAX_AGE_SECONDS: '0',
          BRIC_NEXT_FETCH_CACHE_PRUNE_INTERVAL_SECONDS: '1',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"phase":"periodic"');
    expect(existsSync(oversized)).toBe(false);
  });
});
