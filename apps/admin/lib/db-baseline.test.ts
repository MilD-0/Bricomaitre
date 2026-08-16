import { describe, expect, it, vi } from 'vitest';

import { baselineDbMigrations, resolveBaselineMigrations } from './db-baseline';

describe('lib/db-baseline', () => {
  it('resolves migration records through a target tag', () => {
    const records = resolveBaselineMigrations('0001_products_schema_alignment', process.cwd());

    expect(records.map((record) => record.tag)).toEqual([
      '0000_mean_kulan_gath',
      '0001_products_schema_alignment',
    ]);
    expect(records[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('inserts baseline rows into drizzle.__drizzle_migrations', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const records = await baselineDbMigrations({ execute }, '0001_products_schema_alignment', {
      cwd: process.cwd(),
    });

    expect(records).toHaveLength(2);
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('fails when an existing row has the same position but a different hash', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            hash: 'different-hash',
            createdAt: 1773073269023,
          },
        ],
      });

    await expect(
      baselineDbMigrations({ execute }, '0001_products_schema_alignment', { cwd: process.cwd() }),
    ).rejects.toThrow('hash does not match local migration 0000_mean_kulan_gath');
  });

  it('fails when the database is already beyond the requested baseline point', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
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

    await expect(
      baselineDbMigrations({ execute }, '0000_mean_kulan_gath', { cwd: process.cwd() }),
    ).rejects.toThrow('database already has 2 applied migrations');
  });
});
