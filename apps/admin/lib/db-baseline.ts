import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
};

export type MigrationRecord = {
  tag: string;
  hash: string;
  createdAt: number;
};

export type AppliedMigrationRow = {
  id: number;
  hash: string;
  createdAt: number | null;
};

export function readMigrationJournal(cwd = process.cwd()) {
  const migrationsFolder = resolve(cwd, 'drizzle/migrations');
  const journalPath = resolve(migrationsFolder, 'meta/_journal.json');

  if (!existsSync(journalPath)) {
    throw new Error(`Can't find ${journalPath}`);
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };

  return {
    migrationsFolder,
    entries: journal.entries,
  };
}

export function resolveBaselineMigrations(
  throughTag: string,
  cwd = process.cwd(),
): MigrationRecord[] {
  const { migrationsFolder, entries } = readMigrationJournal(cwd);
  const lastIndex = entries.findIndex((entry) => entry.tag === throughTag);

  if (lastIndex === -1) {
    throw new Error(`Migration tag "${throughTag}" was not found in the journal.`);
  }

  return entries.slice(0, lastIndex + 1).map((entry) => {
    const migrationPath = resolve(migrationsFolder, `${entry.tag}.sql`);

    if (!existsSync(migrationPath)) {
      throw new Error(`Migration file "${migrationPath}" was not found.`);
    }

    const query = readFileSync(migrationPath, 'utf8');

    return {
      tag: entry.tag,
      hash: createHash('sha256').update(query).digest('hex'),
      createdAt: entry.when,
    };
  });
}

export async function listAppliedMigrations(db: {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }>;
}): Promise<AppliedMigrationRow[]> {
  const result = await db.execute(sql`
    select
      "id"::int as "id",
      "hash",
      "created_at"::bigint as "createdAt"
    from "drizzle"."__drizzle_migrations"
    order by "id" asc
  `);

  return (result.rows ?? []).map((row) => {
    const typedRow = row as Record<string, unknown>;

    return {
      id: Number(typedRow.id),
      hash: String(typedRow.hash),
      createdAt: typedRow.createdAt == null ? null : Number(typedRow.createdAt),
    };
  });
}

export async function baselineDbMigrations(
  db: {
    execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }>;
  },
  throughTag: string,
  options: {
    cwd?: string;
  } = {},
) {
  const records = resolveBaselineMigrations(throughTag, options.cwd);

  await db.execute(sql.raw('CREATE SCHEMA IF NOT EXISTS "drizzle"'));
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `),
  );

  const existingRows = await listAppliedMigrations(db);

  if (existingRows.length > records.length) {
    throw new Error(
      `Cannot baseline through ${throughTag}: database already has ${existingRows.length} applied migrations, which is beyond the requested baseline length of ${records.length}.`,
    );
  }

  for (const [index, existingRow] of existingRows.entries()) {
    const expectedRecord = records[index];

    if (!expectedRecord) {
      throw new Error(
        `Cannot baseline through ${throughTag}: database row ${existingRow.id} has no matching local migration record.`,
      );
    }

    if (existingRow.hash !== expectedRecord.hash) {
      throw new Error(
        `Cannot baseline through ${throughTag}: database migration ${existingRow.id} hash does not match local migration ${expectedRecord.tag}.`,
      );
    }

    if (existingRow.createdAt !== expectedRecord.createdAt) {
      throw new Error(
        `Cannot baseline through ${throughTag}: database migration ${existingRow.id} timestamp does not match local migration ${expectedRecord.tag}.`,
      );
    }
  }

  for (const record of records.slice(existingRows.length)) {
    await db.execute(sql`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      SELECT ${record.hash}, ${record.createdAt}
      WHERE NOT EXISTS (
        SELECT 1
        FROM "drizzle"."__drizzle_migrations"
        WHERE "created_at" = ${record.createdAt}
      )
    `);
  }

  return records;
}
