import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, getPool } from '@bric/db/client';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, expect, it } from 'vitest';
import { migrateInIndependentTransactions } from '../lib/independent-db-migrator';

afterAll(() => getPool().end());

it('commits enum additions before use and rolls back both failed migration writes and ledger entries', async () => {
  const db = getDb();
  const schema = `migration_${randomUUID().replaceAll('-', '')}`;
  const folder = await mkdtemp(join(tmpdir(), 'bric-migration-'));
  const config = { migrationsFolder: folder, migrationsSchema: schema };
  const statements = [
    `create type "${schema}".status as enum ('old'); --> statement-breakpoint
     create table "${schema}".records (status "${schema}".status not null);`,
    `alter type "${schema}".status add value 'new';`,
    `insert into "${schema}".records values ('new');`,
    `insert into "${schema}".records values ('old'); --> statement-breakpoint select 1/0;`,
  ];
  await mkdir(join(folder, 'meta'));
  await writeFile(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({
      entries: statements.map((_, i) => ({
        idx: i,
        tag: `fixture_${i}`,
        when: i + 1,
        breakpoints: true,
      })),
    }),
  );
  await Promise.all(
    statements.map((statement, i) => writeFile(join(folder, `fixture_${i}.sql`), statement)),
  );
  try {
    await expect(migrateInIndependentTransactions(db, config)).rejects.toThrow();
    expect(
      (await db.execute(sql`select status from ${sql.identifier(schema)}.records`)).rows,
    ).toEqual([{ status: 'new' }]);
    const ledger = await db.execute(
      sql`select hash, created_at from ${sql.identifier(schema)}.__drizzle_migrations order by created_at`,
    );
    expect(ledger.rows).toEqual(
      readMigrationFiles(config)
        .slice(0, 3)
        .map((migration) => ({ hash: migration.hash, created_at: String(migration.folderMillis) })),
    );
    await expect(migrateInIndependentTransactions(db, config)).rejects.toThrow();
    expect(
      (await db.execute(sql`select status from ${sql.identifier(schema)}.records`)).rows,
    ).toEqual([{ status: 'new' }]);
  } finally {
    await db.execute(sql`drop schema if exists ${sql.identifier(schema)} cascade`);
    await rm(folder, { recursive: true, force: true });
  }
});
