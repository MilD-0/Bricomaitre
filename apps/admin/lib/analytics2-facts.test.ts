import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsEconomicsDailyFactRows,
  resolveAnalyticsFactRefreshFilters,
} from './analytics2-facts';
import { ANALYTICS2_FACT_SEMANTICS_VERSION } from './analytics2-fact-contract';

describe('analytics fact refresh range', () => {
  it('honors an explicit all-history cutoff', () => {
    expect(
      resolveAnalyticsFactRefreshFilters(
        { endDate: '2026-08-19' },
        new Date('2026-08-23T12:00:00.000Z'),
      ),
    ).toMatchObject({ startDate: null, endDate: '2026-08-19', range: 'all' });
  });
});

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
        grossProfitDzd: '10000.000000',
        adjustedProfitDzd: '7500.000000',
        adCostDzd: '2810.000000',
        operatingCostDzd: '500.000000',
        netProfitDzd: '4690.000000',
        trueProfitDzd: '4190.000000',
        automaticPaidCodDzd: '15000.000000',
        automaticPaidFeesDzd: '800.000000',
        automaticPaidProfitDzd: '5200.000000',
        fxRateUsed: '281.0000',
        planningReturnRatePct: '25.0000',
        semanticsVersion: ANALYTICS2_FACT_SEMANTICS_VERSION,
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

  it('materializes spend-only days as a real negative financial result', () => {
    const rows = buildAnalyticsEconomicsDailyFactRows(
      {
        settings: { fxRate: 280, defaultReturnRate: 20 },
        days: [
          {
            date: '2026-08-18',
            postedOrders: 0,
            costCompleteOrders: 0,
            grossProfitDzd: null,
            operatingCostDzd: 500,
            fxRateUsed: 280,
            returnRatePct: null,
            metrics: { adjustedProfitDzd: null, adCostDzd: 28_000, netProfitDzd: null },
            trueProfitDzd: null,
          },
        ],
      } as never,
      { days: [] } as never,
      new Date('2026-08-20T08:00:00.000Z'),
    );

    expect(rows[0]).toMatchObject({
      adjustedProfitDzd: '0.000000',
      netProfitDzd: '-28000.000000',
      trueProfitDzd: '-28500.000000',
      semanticsVersion: ANALYTICS2_FACT_SEMANTICS_VERSION,
    });
  });
});
