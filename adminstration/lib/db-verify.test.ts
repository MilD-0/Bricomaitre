import { describe, expect, it, vi } from 'vitest';

import { verifyDbMigrations } from './db-verify';

describe('lib/db-verify', () => {
  it('accepts matching local and applied migrations', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          hash: 'd82c5bfa582584a4d54d57513bb2599a73918483471d5f57f150d36e2a672c77',
          createdAt: 1773073269023,
        },
        {
          id: 2,
          hash: '0ce8f073b6f6ad8cc35fcb2b0f694b5d86ff371c9eb84bccbb0a0e5a394ad796',
          createdAt: 1773102526756,
        },
      ],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).resolves.toEqual({
      appliedCount: 2,
      localCount: 36,
      latestAppliedTag: '0001_products_schema_alignment',
    });
  });

  it('fails when the database is ahead of the local journal', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: Array.from({ length: 37 }, (_, index) => ({
        id: index + 1,
        hash: `hash-${index + 1}`,
        createdAt: index + 1,
      })),
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).rejects.toThrow(
      'database has 37 applied migrations but the local journal only has 36',
    );
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
          hash: 'd82c5bfa582584a4d54d57513bb2599a73918483471d5f57f150d36e2a672c77',
          createdAt: 123,
        },
      ],
    });

    await expect(verifyDbMigrations({ execute }, { cwd: process.cwd() })).rejects.toThrow(
      'database timestamp 123 does not match local journal timestamp 1773073269023',
    );
  });
});
