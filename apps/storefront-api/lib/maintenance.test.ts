import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  ANALYTICS_ERROR_RETENTION_DAYS,
  ANALYTICS_RAW_RETENTION_DAYS,
  META_DELIVERED_RETENTION_DAYS,
  META_FAILED_RETENTION_DAYS,
  MARKETING_ACCEPTED_RETENTION_DAYS,
  MARKETING_FAILED_RETENTION_DAYS,
  compactRetainedAnalyticsJourneysBatch,
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredPaidClickVisitsBatch,
  deleteTerminalMarketingOutboxBatch,
  rollUpNextExpiredPaidClickDay,
  rollUpNextExpiredAnalyticsDay,
  runStorefrontDataMaintenanceBatch,
} from '@bric/storefront-core/maintenance';

describe('storefront data maintenance', () => {
  const dialect = new PgDialect();

  it('returns the number of rows deleted by a bounded paid-click batch', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ visit_id: 'a' }, { visit_id: 'b' }] });
    const deleted = await deleteExpiredPaidClickVisitsBatch({ execute } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
      limit: 2,
    });

    expect(deleted).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves cleanup sequencing and reports every table result', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ key_hash: 'expired-key' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ visit_id: 'a' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }, { id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 31 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'journey-a' }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await runStorefrontDataMaintenanceBatch({ execute } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
      limit: 10,
    });

    expect(result).toEqual({
      orderIdempotency: 1,
      paidClicks: 1,
      paidClickRolledUpDay: null,
      metaRolledUpDay: null,
      metaErrorsCompacted: 1,
      metaOutbox: 2,
      marketingOutbox: 1,
      rolledUpDay: null,
      analyticsErrorsCompacted: 1,
      analyticsEvents: 1,
      analyticsJourneysCompacted: 1,
      analyticsJourneys: 0,
    });
  });

  it('writes every analytics dimension before making a day deletion-eligible', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ day: '2026-04-01' }] });
    const transactionExecute = vi.fn().mockResolvedValue({ rows: [] });
    const transaction = vi.fn(
      async (callback: (tx: { execute: typeof transactionExecute }) => Promise<void>) => {
        await callback({ execute: transactionExecute });
      },
    );

    const day = await rollUpNextExpiredAnalyticsDay({ execute, transaction } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
    });

    expect(day).toBe('2026-04-01');
    expect(transactionExecute).toHaveBeenCalledTimes(4);
    const rollupSql = [
      ...execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql),
      ...transactionExecute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql),
    ].join('\n');
    expect(rollupSql).not.toContain('storefrontProject');
    expect(rollupSql).toContain("'product'");
  });

  it('persists paid-click outcome counters before making an expired day deletable', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ day: '2026-07-01' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      rollUpNextExpiredPaidClickDay({ execute } as never, {
        now: new Date('2026-07-19T00:00:00Z'),
      }),
    ).resolves.toBe('2026-07-01');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(
      execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql).join('\n'),
    ).not.toContain('storefrontProject');
  });

  it('keeps raw detail for seven days and compact failures for thirty', () => {
    expect(ANALYTICS_RAW_RETENTION_DAYS).toBe(7);
    expect(META_DELIVERED_RETENTION_DAYS).toBe(7);
    expect(ANALYTICS_ERROR_RETENTION_DAYS).toBe(30);
    expect(META_FAILED_RETENTION_DAYS).toBe(30);
    expect(MARKETING_ACCEPTED_RETENTION_DAYS).toBe(7);
    expect(MARKETING_FAILED_RETENTION_DAYS).toBe(30);
  });

  it('deletes only aged terminal marketing deliveries in bounded batches', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });

    await expect(
      deleteTerminalMarketingOutboxBatch({ execute } as never, {
        now: new Date('2026-07-19T00:00:00Z'),
        limit: 25,
      }),
    ).resolves.toBe(1);

    const statement = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(statement).toContain("= 'accepted'");
    expect(statement).toContain("in ('rejected', 'exhausted', 'dropped')");
    expect(statement).not.toContain("in ('queued', 'retrying', 'processing')");
    expect(statement).toContain('limit $');
  });

  it('compacts a retained error journey without dropping its required identity row', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: 'journey-a' }] });

    await expect(
      compactRetainedAnalyticsJourneysBatch({ execute } as never, {
        now: new Date('2026-07-19T00:00:00Z'),
        limit: 1,
      }),
    ).resolves.toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('casts both analytics retention cutoffs before PostgreSQL resolves the CASE type', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await deleteExpiredAnalyticsEventsBatch({ execute } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
      limit: 25,
    });

    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toMatch(/then \$\d+::timestamptz/);
    expect(query.sql).toMatch(/else \$\d+::timestamptz/);
    expect(query.params.filter((value) => value instanceof Date)).toHaveLength(2);
  });
});
