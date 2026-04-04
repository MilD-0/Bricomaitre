import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

export function resolveMigrationFolder(cwd = process.cwd()) {
  return resolve(cwd, 'drizzle/migrations');
}

export async function runDbMigrations(
  db: Parameters<typeof migrate>[0],
  options: {
    cwd?: string;
  } = {},
) {
  const migrationsFolder = resolveMigrationFolder(options.cwd);

  await migrate(db, {
    migrationsFolder,
  });

  return { migrationsFolder };
}
