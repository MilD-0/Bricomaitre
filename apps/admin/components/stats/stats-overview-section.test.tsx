import { describe, expect, it } from 'vitest';

import type { EconomicsReport } from '../../lib/stats-sections';
import { buildOverviewTrajectory } from './stats-overview-section';

describe('buildOverviewTrajectory', () => {
  it('renders incomplete automatic economics as gaps while retaining complete and manual values', () => {
    const economics = {
      days: [
        {
          date: '2026-08-01',
          grossProfitSource: 'automatic',
          postedOrders: 4,
          costCompleteOrders: 3,
          metrics: { adjustedProfitDzd: 1_200 },
          trueProfitDzd: 900,
        },
        {
          date: '2026-08-02',
          grossProfitSource: 'automatic',
          postedOrders: 4,
          costCompleteOrders: 4,
          metrics: { adjustedProfitDzd: 1_500 },
          trueProfitDzd: 1_100,
        },
        {
          date: '2026-08-03',
          grossProfitSource: 'manual',
          postedOrders: 2,
          costCompleteOrders: 0,
          metrics: { adjustedProfitDzd: 800 },
          trueProfitDzd: 600,
        },
      ],
      realized: {
        days: [{ date: '2026-08-01', realizedProfitDzd: 700 }],
      },
    } as unknown as EconomicsReport;

    expect(buildOverviewTrajectory(economics)).toEqual([
      {
        date: '2026-08-01',
        realizedProfitDzd: 700,
        adjustedProfitDzd: null,
        trueProfitDzd: null,
      },
      {
        date: '2026-08-02',
        realizedProfitDzd: null,
        adjustedProfitDzd: 1_500,
        trueProfitDzd: 1_100,
      },
      {
        date: '2026-08-03',
        realizedProfitDzd: null,
        adjustedProfitDzd: 800,
        trueProfitDzd: 600,
      },
    ]);
  });
});
