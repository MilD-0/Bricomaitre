import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  listAppliedMigrations,
  readMigrationJournal,
  type AppliedMigrationRow,
  type MigrationRecord,
} from './db-baseline';

function resolveJournalMigrationRecords(cwd = process.cwd()): MigrationRecord[] {
  const { migrationsFolder, entries } = readMigrationJournal(cwd);

  return entries.map((entry) => {
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

function resolveBootstrapMigrationRecord(cwd = process.cwd()): MigrationRecord {
  const journalPath = resolve(cwd, 'drizzle/bootstrap/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const entry = journal.entries[0];
  if (!entry || journal.entries.length !== 1) {
    throw new Error('The clean-database bootstrap journal must contain exactly one migration.');
  }
  const migrationPath = resolve(cwd, 'drizzle/bootstrap', `${entry.tag}.sql`);
  const query = readFileSync(migrationPath, 'utf8');
  return {
    tag: entry.tag,
    hash: createHash('sha256').update(query).digest('hex'),
    createdAt: entry.when,
  };
}

export type MigrationVerificationResult = {
  appliedCount: number;
  localCount: number;
  latestAppliedTag: string | null;
};

export async function verifyDbMigrations(
  db: {
    execute: Parameters<typeof listAppliedMigrations>[0]['execute'];
  },
  options: {
    cwd?: string;
  } = {},
): Promise<MigrationVerificationResult> {
  const records = resolveJournalMigrationRecords(options.cwd);
  const appliedRows = await listAppliedMigrations(db);
  const bootstrapRecord = resolveBootstrapMigrationRecord(options.cwd);
  const usesBootstrap =
    appliedRows[0]?.hash === bootstrapRecord.hash &&
    appliedRows[0]?.createdAt === bootstrapRecord.createdAt;
  const expectedRecords = usesBootstrap
    ? [bootstrapRecord, ...records.filter((record) => record.createdAt > bootstrapRecord.createdAt)]
    : records;

  if (appliedRows.length > expectedRecords.length) {
    throw new Error(
      `Migration drift detected: database has ${appliedRows.length} applied migrations but the applicable local migration path only has ${expectedRecords.length}. The database is ahead of this checkout.`,
    );
  }

  for (const [index, appliedRow] of appliedRows.entries()) {
    const expectedRecord = expectedRecords[index];

    if (!expectedRecord) {
      throw new Error(
        `Migration drift detected: database migration ${appliedRow.id} has no matching local journal entry.`,
      );
    }

    assertAppliedRowMatchesRecord(appliedRow, expectedRecord);
  }

  return {
    appliedCount: appliedRows.length,
    localCount: expectedRecords.length,
    latestAppliedTag:
      appliedRows.length > 0 ? (expectedRecords[appliedRows.length - 1]?.tag ?? null) : null,
  };
}

function assertAppliedRowMatchesRecord(
  appliedRow: AppliedMigrationRow,
  expectedRecord: MigrationRecord,
) {
  if (appliedRow.hash !== expectedRecord.hash) {
    throw new Error(
      `Migration drift detected at ${expectedRecord.tag}: database hash ${appliedRow.hash} does not match local file hash ${expectedRecord.hash}. This usually means the migration file was edited after being applied or the database was baselined from a different history.`,
    );
  }

  if (appliedRow.createdAt !== expectedRecord.createdAt) {
    throw new Error(
      `Migration drift detected at ${expectedRecord.tag}: database timestamp ${appliedRow.createdAt ?? 'null'} does not match local journal timestamp ${expectedRecord.createdAt}. This usually means the migration ledger was inserted out of band.`,
    );
  }
}
