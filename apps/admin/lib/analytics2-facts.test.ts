import { describe, expect, it } from 'vitest';

import { buildAnalyticsEconomicsDailyFactRows } from './analytics2-facts';

describe('Analytics2 economics facts', () => {
  it('materializes the canonical calculator values and automatic paid economics independently', () => {
    const refreshedAt = new Date('2026-08-20T08:00:00.000Z');
    const rows = buildAnalyticsEconomicsDailyFactRows(
      {
        settings: { fxRate: 280, defaultReturnRate: 20 },
        days: [
          {
            date: '2026-08-19',
            postedOrders: 4,
            costCompleteOrders: 3,
            grossProfitDzd: 10_000,
            operatingCostDzd: 500,
            fxRateUsed: 281,
            returnRatePct: 25,
            metrics: {
              adjustedProfitDzd: 7_500,
              adCostDzd: 2_810,
              netProfitDzd: 4_690,
            },
            trueProfitDzd: 4_190,
          },
        ],
      } as never,
      {
        days: [
          {
            date: '2026-08-19',
            paidOrders: 2,
            completeOrders: 2,
            codDzd: 15_000,
            feesDzd: 800,
            profitDzd: 5_200,
          },
        ],
      } as never,
      refreshedAt,
    );

    expect(rows).toEqual([
      {
        day: '2026-08-19',
        postedOrders: 4,
        paidOrders: 2,
        costCompleteOrders: 3,
        paidProfitCompleteOrders: 2,
        grossProfitDzd: '10000.00',
        adjustedProfitDzd: '7500.00',
        adCostDzd: '2810.00',
        operatingCostDzd: '500.00',
        netProfitDzd: '4690.00',
        trueProfitDzd: '4190.00',
        automaticPaidCodDzd: '15000.00',
        automaticPaidFeesDzd: '800.00',
        automaticPaidProfitDzd: '5200.00',
        fxRateUsed: '281.0000',
        planningReturnRatePct: '25.0000',
        semanticsVersion: 1,
        refreshedAt,
      },
    ]);
  });

  it('keeps missing projected and paid profit values nullable instead of inventing zeroes', () => {
    const rows = buildAnalyticsEconomicsDailyFactRows(
      {
        settings: { fxRate: 280, defaultReturnRate: 20 },
        days: [
          {
            date: '2026-08-20',
            postedOrders: 1,
            costCompleteOrders: 0,
            grossProfitDzd: null,
            operatingCostDzd: 0,
            fxRateUsed: 0,
            returnRatePct: null,
            metrics: { adjustedProfitDzd: null, adCostDzd: 0, netProfitDzd: null },
            trueProfitDzd: null,
          },
        ],
      } as never,
      { days: [] } as never,
      new Date('2026-08-20T08:00:00.000Z'),
    );

    expect(rows[0]).toMatchObject({
      grossProfitDzd: null,
      adjustedProfitDzd: null,
      netProfitDzd: null,
      trueProfitDzd: null,
      automaticPaidProfitDzd: null,
      fxRateUsed: '280.0000',
      planningReturnRatePct: '20.0000',
    });
  });
});
