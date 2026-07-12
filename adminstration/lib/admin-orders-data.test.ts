import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { getDbMock, hasDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));

vi.mock('../db/client', () => ({
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
      .filter((built) =>
        built.sql.includes('from "order_status_history"')
        && built.sql.includes('"order_status_history"."status" = 1')
        && built.sql.includes('"order_status_history"."changed_at" >='),
      );

    expect(noAnswerQueries).toHaveLength(2);
    expect(noAnswerQueries[0]?.params).toEqual(expect.arrayContaining(['2026-07-02']));
    expect(noAnswerQueries[1]?.params).toEqual(expect.arrayContaining(['2026-07-01']));
  });
});
