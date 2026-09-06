import { describe, expect, it } from 'vitest';

import {
  parseDropTables,
  parseLegacyImportArgs,
  resolveSelectedTargets,
} from './legacy-mongo-import-script';

describe('tools/legacy-data/legacy-mongo-import-script', () => {
  it('defaults to dry-run mode until --replace is provided', () => {
    expect(parseLegacyImportArgs([])).toEqual(
      expect.objectContaining({
        replace: false,
        skipBlockedOrders: false,
      }),
    );

    expect(() => parseLegacyImportArgs(['--replace', '--drop-scope', 'typo'])).toThrow(
      'Drop scope',
    );
    expect(parseLegacyImportArgs(['--replace', '--skip-blocked-orders'])).toEqual(
      expect.objectContaining({
        replace: true,
        skipBlockedOrders: true,
      }),
    );
  });

  it('parses custom drop tables and rejects unknown targets', () => {
    expect(parseDropTables('brands, orders,brands')).toEqual(['brands', 'orders']);
    expect(() => parseDropTables('unknown')).toThrow('Unknown drop tables');
  });

  it('requires a write scope and custom targets when needed', () => {
    expect(() =>
      resolveSelectedTargets({
        dir: null,
        brandsPath: null,
        categoriesPath: null,
        productsPath: null,
        ordersPath: null,
        skipBlockedOrders: false,
        replace: true,
        json: false,
        dropScope: null,
        dropTables: [],
      }),
    ).toThrow('drop scope');

    expect(() =>
      resolveSelectedTargets({
        dir: null,
        brandsPath: null,
        categoriesPath: null,
        productsPath: null,
        ordersPath: null,
        skipBlockedOrders: false,
        replace: true,
        json: false,
        dropScope: 'custom',
        dropTables: [],
      }),
    ).toThrow('at least one');
  });
});
