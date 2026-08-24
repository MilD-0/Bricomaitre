import { sql } from 'drizzle-orm';
import { readMigrationFiles, type MigrationConfig } from 'drizzle-orm/migrator';

import type { getDb } from '@bric/db/client';

type Database = ReturnType<typeof getDb>;

/**
 * Drizzle's node-postgres migrator wraps every pending file in one transaction.
 * PostgreSQL enum additions must commit before a later migration can use the new
 * value, so keep the same ledger format while making each file its own atomic unit.
 */
export async function migrateInIndependentTransactions(db: Database, config: MigrationConfig) {
  const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
  const migrationsSchema = config.migrationsSchema ?? 'drizzle';
  const schemaIdentifier = sql.identifier(migrationsSchema);
  const tableIdentifier = sql.identifier(migrationsTable);

  await db.execute(sql`create schema if not exists ${schemaIdentifier}`);
  await db.execute(sql`
    create table if not exists ${schemaIdentifier}.${tableIdentifier} (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  const latestResult = await db.execute(sql`
    select created_at as "createdAt"
    from ${schemaIdentifier}.${tableIdentifier}
    order by created_at desc
    limit 1
  `);
  const latestCreatedAt = Number(
    (latestResult.rows[0] as { createdAt?: number | string } | undefined)?.createdAt ?? 0,
  );
  const migrations = readMigrationFiles(config).filter(
    (migration) => migration.folderMillis > latestCreatedAt,
  );

  for (const migration of migrations) {
    await db.transaction(async (tx) => {
      for (const statement of migration.sql) {
        if (statement.trim()) await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`
        insert into ${schemaIdentifier}.${tableIdentifier} (hash, created_at)
        values (${migration.hash}, ${migration.folderMillis})
      `);
    });
  }

  return { applied: migrations.length };
}
