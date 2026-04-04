import { describe, expect, it, vi } from 'vitest';

import { resolveMigrationFolder, runDbMigrations } from './db-migrate';

const { migrateMock } = vi.hoisted(() => ({
  migrateMock: vi.fn(),
}));

vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: migrateMock,
}));

describe('lib/db-migrate', () => {
  it('resolves the drizzle migrations folder from cwd', () => {
    expect(resolveMigrationFolder('/workspace/app')).toBe('/workspace/app/drizzle/migrations');
  });

  it('runs migrations against the resolved folder', async () => {
    const db = { marker: 'db' } as never;

    await runDbMigrations(db, { cwd: '/workspace/app' });

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: '/workspace/app/drizzle/migrations',
    });
  });
});
