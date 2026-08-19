import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { getDbMock, hasDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));

import { loadDailyOrderStatusOverview } from './admin-orders-data';

describe('loadDailyOrderStatusOverview', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
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

  it('uses posted status transitions for both daily and previous-month projection cohorts', async () => {
    const dialect = new PgDialect();
    const projectionPredicates: Parameters<PgDialect['sqlToQuery']>[0][] = [];
    let selectIndex = 0;
    const selectMock = vi.fn(() => {
      const currentSelectIndex = selectIndex++;
      const builder = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn((predicate: Parameters<PgDialect['sqlToQuery']>[0]) => {
          if (currentSelectIndex % 3 !== 1) {
            projectionPredicates.push(predicate);
          }

          return Promise.resolve(currentSelectIndex % 3 === 1 ? [{ spend: 0 }] : []);
        }),
      };

      return builder;
    });
    const executeMock = vi.fn().mockResolvedValue({ rows: [{ value: 0 }] });

    getDbMock.mockReturnValue({
      execute: executeMock,
      select: selectMock,
      selectDistinct: selectMock,
    });

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
    expect(projectionPredicates).toHaveLength(4);

    const builtPredicates = projectionPredicates.map((predicate) => dialect.sqlToQuery(predicate));
    expect(builtPredicates.every((built) => built.params.includes(11))).toBe(true);
    expect(builtPredicates.filter((built) => built.params.includes('2026-07-02'))).toHaveLength(1);
    expect(builtPredicates.filter((built) => built.params.includes('2026-07-01'))).toHaveLength(1);
    expect(
      builtPredicates.filter(
        (built) => built.params.includes('2026-06-01') && built.params.includes('2026-06-30'),
      ),
    ).toHaveLength(2);

    projectionPredicates.length = 0;
    selectIndex = 0;

    const confirmedOverview = await loadDailyOrderStatusOverview({ includeProfitProjection: true });
    expect(confirmedOverview).toMatchObject({
      available: true,
      reports: [
        expect.objectContaining({
          profitProjection: expect.objectContaining({ basis: 'confirmed' }),
        }),
        expect.objectContaining({
          profitProjection: expect.objectContaining({ basis: 'confirmed' }),
        }),
      ],
    });
    expect(projectionPredicates).toHaveLength(4);
    expect(
      projectionPredicates.every((predicate) => dialect.sqlToQuery(predicate).params.includes(2)),
    ).toBe(true);
  });
});
