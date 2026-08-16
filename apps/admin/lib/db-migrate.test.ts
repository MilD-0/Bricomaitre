import { describe, expect, it, vi } from 'vitest';

import {
  resolveBootstrapMigrationFolder,
  resolveMigrationFolder,
  runDbMigrations,
} from './db-migrate';

const { migrateMock } = vi.hoisted(() => ({
  migrateMock: vi.fn(),
}));

vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: migrateMock,
}));

describe('lib/db-migrate', () => {
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
  });

  it('preserves the production forward-migration path when application tables exist', async () => {
    migrateMock.mockReset();
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ hasApplicationTables: true }] }),
    } as never;

    await runDbMigrations(db, { cwd: '/workspace/app' });

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: '/workspace/app/drizzle/migrations',
    });
    expect(migrateMock).toHaveBeenCalledOnce();
  });
});
