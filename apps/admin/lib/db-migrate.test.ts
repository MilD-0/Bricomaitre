import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertProductIdentifiersReadyForMigrations,
  findProductIdentifierConflicts,
  resolveBootstrapMigrationFolder,
  resolveMigrationFolder,
  runDbMigrations,
} from './db-migrate';

const { migrateMock } = vi.hoisted(() => ({
  migrateMock: vi.fn(),
}));
const { commercialBackfillMock, phoneBackfillMock, offPipelineSalesBackfillMock } = vi.hoisted(
  () => ({
    commercialBackfillMock: vi.fn(),
    phoneBackfillMock: vi.fn(),
    offPipelineSalesBackfillMock: vi.fn(),
  }),
);

vi.mock('./independent-db-migrator', () => ({
  migrateInIndependentTransactions: migrateMock,
}));
vi.mock('./order-commercial-backfill', () => ({
  backfillOrderCommercialSnapshots: commercialBackfillMock,
  backfillOrderNormalizedPhones: phoneBackfillMock,
}));
vi.mock('./off-pipeline-sales-backfill', () => ({
  backfillLegacyManualOrders: offPipelineSalesBackfillMock,
}));

describe('lib/db-migrate', () => {
  beforeEach(() => {
    commercialBackfillMock.mockReset();
    commercialBackfillMock.mockResolvedValue({
      scanned: 0,
      backfilled: 0,
      unresolvedOrderIds: [],
    });
    phoneBackfillMock.mockReset();
    phoneBackfillMock.mockResolvedValue({ scanned: 0, backfilled: 0, invalidOrderIds: [] });
    offPipelineSalesBackfillMock.mockReset();
    offPipelineSalesBackfillMock.mockResolvedValue({
      scanned: 0,
      migrated: 0,
      disabledActions: 0,
    });
  });
  it('resolves the drizzle migrations folder from cwd', () => {
    expect(resolveMigrationFolder('/workspace/app')).toBe('/workspace/app/drizzle/migrations');
    expect(resolveBootstrapMigrationFolder('/workspace/app')).toBe(
      '/workspace/app/drizzle/bootstrap',
    );
  });

  it('runs the generated bootstrap before forward migrations for an empty database', async () => {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ hasApplicationTables: false }] })
        .mockResolvedValueOnce({ rows: [] }),
    } as never;

    await runDbMigrations(db, { cwd: '/workspace/app' });

    expect(migrateMock).toHaveBeenNthCalledWith(1, db, {
      migrationsFolder: '/workspace/app/drizzle/bootstrap',
    });
    expect(migrateMock).toHaveBeenNthCalledWith(2, db, {
      migrationsFolder: '/workspace/app/drizzle/migrations',
    });
    expect((db as { execute: ReturnType<typeof vi.fn> }).execute).toHaveBeenCalledTimes(2);
    expect(commercialBackfillMock).toHaveBeenCalledWith(db);
    expect(phoneBackfillMock).toHaveBeenCalledWith(db);
    expect(offPipelineSalesBackfillMock).toHaveBeenCalledWith(db);
  });

  it('preserves the production forward-migration path when application tables exist', async () => {
    migrateMock.mockReset();
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ hasApplicationTables: true }] })
        .mockResolvedValueOnce({ rows: [{ hasProductsTable: false }] }),
    } as never;

    await runDbMigrations(db, { cwd: '/workspace/app' });

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: '/workspace/app/drizzle/migrations',
    });
    expect(migrateMock).toHaveBeenCalledOnce();
    expect(commercialBackfillMock).toHaveBeenCalledWith(db);
    expect(phoneBackfillMock).toHaveBeenCalledWith(db);
    expect(offPipelineSalesBackfillMock).toHaveBeenCalledWith(db);
  });

  it('preserves unresolved historical carts and continues independent legacy backfills', async () => {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ hasApplicationTables: true }] })
        .mockResolvedValueOnce({ rows: [{ hasProductsTable: false }] }),
    } as never;
    commercialBackfillMock.mockResolvedValue({
      scanned: 2,
      backfilled: 1,
      unresolvedOrderIds: [44],
    });

    await expect(runDbMigrations(db, { cwd: '/workspace/app' })).resolves.toMatchObject({
      commercialBackfill: {
        scanned: 2,
        backfilled: 1,
        unresolvedOrderIds: [44],
      },
      phoneBackfill: { scanned: 0, backfilled: 0, invalidOrderIds: [] },
      offPipelineSalesBackfill: { scanned: 0, migrated: 0, disabledActions: 0 },
    });
    expect(phoneBackfillMock).toHaveBeenCalledWith(db);
  });

  it('normalizes duplicate identifier evidence from the existing catalog', async () => {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ hasProductsTable: true }] })
        .mockResolvedValueOnce({
          rows: [{ field: 'barcode', value: 'abc', productIds: [2, 9] }],
        }),
    } as never;

    await expect(findProductIdentifierConflicts(db)).resolves.toEqual([
      { field: 'barcode', value: 'abc', productIds: [2, 9] },
    ]);
  });

  it('aborts before migration when case-insensitive product identifiers collide', async () => {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ hasProductsTable: true }] })
        .mockResolvedValueOnce({
          rows: [{ field: 'sku', value: 'sku-7', productIds: [7, 12] }],
        }),
    } as never;

    await expect(assertProductIdentifiersReadyForMigrations(db)).rejects.toThrow(
      'SKU "sku-7" on products 7, 12',
    );
  });
});
