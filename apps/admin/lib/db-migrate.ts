import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export function resolveMigrationFolder(cwd = process.cwd()) {
  return resolve(cwd, 'drizzle/migrations');
}

export function resolveBootstrapMigrationFolder(cwd = process.cwd()) {
  return resolve(cwd, 'drizzle/bootstrap');
}

async function hasApplicationTables(db: Parameters<typeof migrate>[0]) {
  const result = await db.execute(sql`
    select exists (
      select 1
      from pg_catalog.pg_tables
      where schemaname in ('public', 'admin')
    ) as "hasApplicationTables"
  `);
  return Boolean(
    (result.rows[0] as { hasApplicationTables?: boolean } | undefined)?.hasApplicationTables,
  );
}

export async function runDbMigrations(
  db: Parameters<typeof migrate>[0],
  options: {
    cwd?: string;
  } = {},
) {
  const migrationsFolder = resolveMigrationFolder(options.cwd);
  const bootstrapMigrationsFolder = resolveBootstrapMigrationFolder(options.cwd);
  const useBootstrap = !(await hasApplicationTables(db));

  if (useBootstrap) {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await migrate(db, {
      migrationsFolder: bootstrapMigrationsFolder,
    });
  }

  await migrate(db, {
    migrationsFolder,
  });

  return { migrationsFolder, bootstrapMigrationsFolder, usedBootstrap: useBootstrap };
}
