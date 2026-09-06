import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hasOnlyBlockedCartRefs, shouldAbortForBlockedOrders } from './import-legacy-mongo';

describe('tools/legacy-data/import-legacy-mongo', () => {
  it('honors explicit dry-run even alongside replace without opening a database connection', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-legacy-preview-'));
    try {
      for (const target of ['brands', 'categories', 'products', 'orders']) {
        writeFileSync(join(directory, `mongo-${target}.json`), '[]');
      }
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('tools/legacy-data/import-legacy-mongo.ts'),
          '--replace',
          '--dry-run',
          '--drop-scope',
          'import',
          '--dir',
          directory,
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: 'postgresql://preview:preview@127.0.0.1:1/unused' },
          encoding: 'utf8',
          timeout: 15_000,
        },
      );
      expect(output).toContain('Mode: dry-run');
      expect(output).toContain('No database changes were applied');
      expect(output).not.toContain('completed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('aborts by default when blocked orders are present', () => {
    expect(
      shouldAbortForBlockedOrders(
        { skipBlockedOrders: false },
        {
          orderDiagnostics: {
            skippedForState: [],
            blockedByCart: [{ mongoId: 'order-1', missingRefs: ['missing-product'] }],
          },
        },
      ),
    ).toBe(true);
  });

  it('allows write mode to continue when skipping blocked orders is enabled', () => {
    expect(
      shouldAbortForBlockedOrders(
        { skipBlockedOrders: true },
        {
          orderDiagnostics: {
            skippedForState: [],
            blockedByCart: [{ mongoId: 'order-1', missingRefs: ['missing-product'] }],
          },
        },
      ),
    ).toBe(false);
  });

  it('only treats unmatched cart-product errors as skippable', () => {
    expect(
      hasOnlyBlockedCartRefs([
        { code: 'unmatched_cart_product' },
        { code: 'unmatched_cart_product' },
      ]),
    ).toBe(true);

    expect(hasOnlyBlockedCartRefs([])).toBe(false);
    expect(
      hasOnlyBlockedCartRefs([{ code: 'unmatched_cart_product' }, { code: 'unexpected_error' }]),
    ).toBe(false);
  });
});
