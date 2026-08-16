import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { readMigrationJournal } from './db-baseline';
import { verifyDbMigrations } from './db-verify';

describe('lib/db-verify', () => {
  const { migrationsFolder, entries } = readMigrationJournal(process.cwd());
  const firstEntry = entries[0];
  const secondEntry = entries[1];
  const firstHash = createHash('sha256')
    .update(readFileSync(resolve(migrationsFolder, `${firstEntry?.tag}.sql`), 'utf8'))
    .digest('hex');
  const secondHash = createHash('sha256')
    .update(readFileSync(resolve(migrationsFolder, `${secondEntry?.tag}.sql`), 'utf8'))
    .digest('hex');
  const bootstrapJournal = JSON.parse(
    readFileSync(resolve(process.cwd(), 'drizzle/bootstrap/meta/_journal.json'), 'utf8'),
  ) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const bootstrapEntry = bootstrapJournal.entries[0]!;
  const bootstrapHash = createHash('sha256')
    .update(
      readFileSync(
        resolve(process.cwd(), 'drizzle/bootstrap', `${bootstrapEntry.tag}.sql`),
        'utf8',
      ),
    )
    .digest('hex');

  it('accepts matching local and applied migrations', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          hash: firstHash,
          createdAt: firstEntry?.when,
        },
        {
          id: 2,
          hash: secondHash,
          createdAt: secondEntry?.when,
        },
      ],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).resolves.toEqual({
      appliedCount: 2,
      localCount: entries.length,
      latestAppliedTag: secondEntry?.tag ?? null,
    });
  });

  it('fails when the database is ahead of the local journal', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: Array.from({ length: entries.length + 1 }, (_, index) => ({
        id: index + 1,
        hash: `hash-${index + 1}`,
        createdAt: index + 1,
      })),
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).rejects.toThrow(
      `database has ${entries.length + 1} applied migrations but the applicable local migration path only has ${entries.length}`,
    );
  });

  it('accepts the generated clean-database bootstrap as an alternate migration root', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ id: 1, hash: bootstrapHash, createdAt: bootstrapEntry.when }],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).resolves.toEqual({
      appliedCount: 1,
      localCount: 1,
      latestAppliedTag: bootstrapEntry.tag,
    });
  });

  it('fails when an applied migration hash does not match the local file', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          hash: 'not-the-local-hash',
          createdAt: 1773073269023,
        },
      ],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).rejects.toThrow(
      'Migration drift detected at 0000_mean_kulan_gath',
    );
  });

  it('fails when an applied migration timestamp does not match the local journal', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          hash: firstHash,
          createdAt: 123,
        },
      ],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).rejects.toThrow(
      `database timestamp 123 does not match local journal timestamp ${firstEntry?.when}`,
    );
  });
});
