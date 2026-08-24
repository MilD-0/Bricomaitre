import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { getCanonicalOrderProjectionDaysMock, getDbMock, hasDbMock } = vi.hoisted(() => ({
  getCanonicalOrderProjectionDaysMock: vi.fn(),
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));

vi.mock('./profit-tracker', () => ({
  getCanonicalOrderProjectionDays: getCanonicalOrderProjectionDaysMock,
}));

import { loadDailyOrderStatusOverview } from './admin-orders-data';

describe('loadDailyOrderStatusOverview', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    getCanonicalOrderProjectionDaysMock.mockReset();
    hasDbMock.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scopes no-answer orders to each report day', async () => {
    const dialect = new PgDialect();
    const executeMock = vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const built = dialect.sqlToQuery(query);

      if (
        built.sql.includes('from "order_status_history"') &&
        built.sql.includes('"order_status_history"."status" = 1') &&
        built.sql.includes('"order_status_history"."changed_at" >=')
      ) {
        if (built.params.includes('2026-07-02')) {
          return { rows: [{ value: 8 }] };
        }

        if (built.params.includes('2026-07-01')) {
          return { rows: [{ value: 3 }] };
        }
      }

      return { rows: [{ value: 0 }] };
    });

    getDbMock.mockReturnValue({ execute: executeMock });

    const overview = await loadDailyOrderStatusOverview({ includeProfitProjection: false });

    expect(overview).toMatchObject({
      available: true,
      reportDay: '2026-07-02',
      noAnswerOrders: 8,
      reports: [
        expect.objectContaining({
          reportDay: '2026-07-02',
          noAnswerOrders: 8,
        }),
        expect.objectContaining({
          reportDay: '2026-07-01',
          noAnswerOrders: 3,
        }),
      ],
    });

    const noAnswerQueries = executeMock.mock.calls
      .map(([query]) => dialect.sqlToQuery(query))
      .filter(
        (built) =>
          built.sql.includes('from "order_status_history"') &&
          built.sql.includes('"order_status_history"."status" = 1') &&
          built.sql.includes('"order_status_history"."changed_at" >='),
      );

    expect(noAnswerQueries).toHaveLength(2);
    expect(noAnswerQueries[0]?.params).toEqual(expect.arrayContaining(['2026-07-02']));
    expect(noAnswerQueries[1]?.params).toEqual(expect.arrayContaining(['2026-07-01']));
  });

  it('can load a bounded seven-day operating window without changing the default', async () => {
    const dialect = new PgDialect();
    const executeMock = vi.fn(async () => ({ rows: [{ value: 0 }] }));

    getDbMock.mockReturnValue({ execute: executeMock });

    const overview = await loadDailyOrderStatusOverview({
      includeProfitProjection: false,
      reportDays: 7,
    });

    expect(overview).toMatchObject({
      available: true,
      reportDay: '2026-07-02',
      reports: [
        { reportDay: '2026-07-02' },
        { reportDay: '2026-07-01' },
        { reportDay: '2026-06-30' },
        { reportDay: '2026-06-29' },
        { reportDay: '2026-06-28' },
        { reportDay: '2026-06-27' },
        { reportDay: '2026-06-26' },
      ],
    });

    const reportDays = new Set(
      executeMock.mock.calls
        .flatMap(([query]) => dialect.sqlToQuery(query).params)
        .filter(
          (value): value is string => typeof value === 'string' && /^2026-\d{2}-\d{2}$/.test(value),
        ),
    );
    expect(reportDays).toEqual(
      new Set([
        '2026-07-02',
        '2026-07-01',
        '2026-06-30',
        '2026-06-29',
        '2026-06-28',
        '2026-06-27',
        '2026-06-26',
      ]),
    );
  });

  it('loads the selected cohort through one canonical analytics economics range', async () => {
    const executeMock = vi.fn().mockResolvedValue({ rows: [{ value: 0 }] });
    const db = { execute: executeMock };
    getDbMock.mockReturnValue(db);
    getCanonicalOrderProjectionDaysMock.mockResolvedValue([
      {
        basis: 'posted',
        reportDay: '2026-07-02',
        grossProfit: 12_000,
        adSpend: 2_000,
        estimatedReturnRate: 10,
        estimatedReturnedOrders: 1,
        estimatedReturnLoss: 1_200,
        projectedProfit: 8_800,
      },
      {
        basis: 'posted',
        reportDay: '2026-07-01',
        grossProfit: null,
        adSpend: null,
        estimatedReturnRate: 10,
        estimatedReturnedOrders: 0,
        estimatedReturnLoss: null,
        projectedProfit: null,
      },
    ]);

    const overview = await loadDailyOrderStatusOverview({
      includeProfitProjection: true,
      profitProjectionBasis: 'posted',
    });

    expect(overview).toMatchObject({
      available: true,
      reports: [
        expect.objectContaining({ profitProjection: expect.objectContaining({ basis: 'posted' }) }),
        expect.objectContaining({ profitProjection: expect.objectContaining({ basis: 'posted' }) }),
      ],
    });
    expect(getCanonicalOrderProjectionDaysMock).toHaveBeenCalledOnce();
    expect(getCanonicalOrderProjectionDaysMock).toHaveBeenCalledWith(
      {
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        basis: 'posted',
      },
      { db },
    );
    expect(overview.reports[0]?.profitProjection).toMatchObject({
      projectedProfit: 8_800,
    });
  });
});
