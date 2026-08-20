import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readMigrationFilesMock } = vi.hoisted(() => ({
  readMigrationFilesMock: vi.fn(),
}));

vi.mock('drizzle-orm/migrator', () => ({
  readMigrationFiles: readMigrationFilesMock,
}));

import { migrateInIndependentTransactions } from './independent-db-migrator';

describe('independent Postgres migration runner', () => {
  beforeEach(() => {
    readMigrationFilesMock.mockReset();
  });

  it('commits each pending migration independently and preserves the Drizzle ledger', async () => {
    readMigrationFilesMock.mockReturnValue([
      { folderMillis: 100, hash: 'old', sql: ['select 0'], bps: true },
      { folderMillis: 200, hash: 'enum', sql: ['alter type example add value \'new\''], bps: true },
      { folderMillis: 300, hash: 'use-enum', sql: ["select 'new'::example"], bps: true },
    ]);
    const transactionExecutions: Array<ReturnType<typeof vi.fn>> = [];
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ createdAt: 100 }] }),
      transaction: vi.fn(async (callback: (tx: { execute: ReturnType<typeof vi.fn> }) => unknown) => {
        const execute = vi.fn().mockResolvedValue({ rows: [] });
        transactionExecutions.push(execute);
        return callback({ execute });
      }),
    };

    await expect(
      migrateInIndependentTransactions(db as never, { migrationsFolder: '/migrations' }),
    ).resolves.toEqual({ applied: 2 });

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(transactionExecutions).toHaveLength(2);
    expect(transactionExecutions[0]).toHaveBeenCalledTimes(2);
    expect(transactionExecutions[1]).toHaveBeenCalledTimes(2);
  });
});
