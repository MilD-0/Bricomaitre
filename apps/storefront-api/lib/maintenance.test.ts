import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  ANALYTICS_ERROR_RETENTION_DAYS,
  ANALYTICS_RAW_RETENTION_DAYS,
  META_DELIVERED_RETENTION_DAYS,
  META_FAILED_RETENTION_DAYS,
  MARKETING_ACCEPTED_RETENTION_DAYS,
  MARKETING_FAILED_RETENTION_DAYS,
  PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS,
  backfillOrderAcquisitionAttributionBatch,
  backfillOrderAiInfluenceBatch,
  compactRetainedAnalyticsJourneysBatch,
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredAnalyticsSessionsBatch,
  deleteExpiredPaidClickVisitsBatch,
  deleteTerminalMarketingOutboxBatch,
  normalizeNextPaidClickRollupDays,
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
    const statement = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(statement).toContain('from "order_acquisition_attribution" attribution');
  });

  it('preserves cleanup sequencing and reports every table result', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ key_hash: 'expired-key' }] })
      .mockResolvedValueOnce({ rows: [{ order_id: 41 }, { order_id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ order_id: 51 }] })
      .mockResolvedValueOnce({ rows: [{ day: '2026-07-01' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ visit_id: 'a' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }, { id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 31 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'session-a' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'journey-a' }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await runStorefrontDataMaintenanceBatch({ execute } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
      limit: 10,
    });

    expect(result).toEqual({
      orderIdempotency: 1,
      orderAcquisitionBackfilled: 2,
      orderAiInfluenceBackfilled: 1,
      paidClickNormalizedDays: ['2026-07-01'],
      paidClicks: 1,
      paidClickRolledUpDay: null,
      metaRolledUpDay: null,
      metaErrorsCompacted: 1,
      metaOutbox: 2,
      marketingOutbox: 1,
      rolledUpDay: null,
      analyticsErrorsCompacted: 1,
      analyticsEvents: 1,
      analyticsSessions: 1,
      analyticsJourneysCompacted: 1,
      analyticsJourneys: 0,
    });
  });

  it('reconstructs recent assistant influence from retained behavior and ordered products', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ order_id: 51 }] });

    await expect(backfillOrderAiInfluenceBatch({ execute } as never, { limit: 20 })).resolves.toBe(
      1,
    );

    const statement = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(statement).toContain("events.event_name = 'ai_assistant_message'");
    expect(statement).toContain('lines.product_id = any(assistant.clicked_product_ids)');
    expect(statement).toContain("interval '24 hours'");
    expect(statement).toContain("'recommended_product_ordered'");
    expect(statement).not.toMatch(/message_text|prompt|content/);
  });

  it('backfills only stable, privacy-safe order attribution before raw deletion', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ order_id: 41 }] });

    await expect(
      backfillOrderAcquisitionAttributionBatch({ execute } as never, { limit: 50 }),
    ).resolves.toBe(1);

    const statement = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(statement).toContain("'legacy_visit_backfill'");
    expect(statement).toContain('inner join "orders" on "orders"."visit_id" = visits.visit_id');
    expect(statement).toContain("'meta_unclassified'");
    expect(statement).toContain("utm_source in ('fb', 'facebook', 'ig', 'instagram'");
    expect(statement).toContain("utm_content ~ '^[0-9]{6,30}$'");
    expect(statement).not.toMatch(/fbclid_raw|client_ip|user_agent/);
  });

  it('atomically compacts a bounded set of query-bearing paid-click rollup days', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ day: '2026-07-01' }, { day: '2026-07-02' }, { day: '2026-07-01' }],
    });

    await expect(normalizeNextPaidClickRollupDays({ execute } as never)).resolves.toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
    const statement = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(statement).toContain('delete from "analytics_paid_click_daily_rollups" rollups');
    expect(statement).toContain("split_part(landing_path, '?', 1)");
    expect(statement).toContain('limit $1');
    expect(dialect.sqlToQuery(execute.mock.calls[0]![0]).params).toContain(
      PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS,
    );
    expect(statement).toContain('on conflict');
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
    expect(transactionExecute).toHaveBeenCalledTimes(8);
    const rollupSql = [
      ...execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql),
      ...transactionExecute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql),
    ].join('\n');
    expect(rollupSql).not.toContain('storefrontProject');
    expect(rollupSql).toContain("'product'");
    expect(rollupSql).toContain('"analytics_acquisition_daily_rollups"');
    expect(rollupSql).toContain('"analytics_ai_daily_rollups"');
    expect(rollupSql).toContain("'ai_journey'");
    expect(rollupSql).toContain('not_helpful');
    expect(rollupSql).toContain('cancelled');
    expect(rollupSql).toContain("metadata->>'rating'");
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
    const sql = execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql).join('\n');
    expect(sql).not.toContain('storefrontProject');
    expect(sql).toContain("split_part(visits.landing_path, '?', 1)");
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
    expect(query.sql).toContain('"analytics_events"."event_name" not in');
    expect(query.sql).toContain("'ai_assistant_feedback'");
    expect(query.sql).toContain("'ai_assistant_run'");
  });

  it('retains session context referenced by full assistant operations', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await deleteExpiredAnalyticsSessionsBatch({ execute } as never, {
      now: new Date('2026-07-19T00:00:00Z'),
      limit: 25,
    });

    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain('not exists');
    expect(query.sql).toContain("'ai_assistant_message'");
    expect(query.sql).toContain('"analytics_events"."session_id"');
  });
});
