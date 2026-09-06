import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('loads the selected cohort through one canonical analytics economics range', async () => {
    const executeMock = vi.fn().mockResolvedValue({ rows: [] });
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
    if (!overview.available) throw new Error('Expected an available order overview.');
    expect(overview.reports[0]?.profitProjection).toMatchObject({
      projectedProfit: 8_800,
    });
  });
});
