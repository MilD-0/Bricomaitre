import { describe, expect, it } from 'vitest';

import { loadAutomaticPaidEconomics, resolveAnalyticsFilters } from './analytics';

import { aggregateAutomaticPaidSeries } from './analytics/economics-series';

describe('automatic paid economics', () => {
  it('suppresses paid profit at the explicit 100% operator setting without hiding cash facts', async () => {
    const db = {
      execute: async () => ({
        rows: [
          {
            day: '2026-08-15',
            paid_orders: 2,
            cod: 20_000,
            fees: 800,
            net_recovered: 19_200,
            product_cost: 10_000,
            profit: 9_200,
            complete_orders: 2,
            provider_amount_orders: 2,
            legacy_amount_orders: 0,
            submitted_amount_orders: 0,
          },
        ],
      }),
    };
    const filters = resolveAnalyticsFilters(
      { view: 'money', range: 'custom', startDate: '2026-08-15', endDate: '2026-08-15' },
      new Date('2026-08-15T12:00:00.000Z'),
    );

    const result = await loadAutomaticPaidEconomics(db as never, filters, true);

    expect(result.days[0]).toMatchObject({
      paidOrders: 2,
      codDzd: 20_000,
      feesDzd: 800,
      netRecoveredDzd: 19_200,
      productCostDzd: 10_000,
      profitDzd: 0,
    });
    expect(result.summary.profitDzd).toBe(0);
  });

  it('aggregates paid COD, fees and profit without applying the planning return rate again', () => {
    const series = aggregateAutomaticPaidSeries(
      {
        summary: {
          paidOrders: 3,
          codDzd: 30_000,
          feesDzd: 1_200,
          netRecoveredDzd: 28_800,
          productCostDzd: 15_000,
          profitDzd: 13_800,
          completeOrders: 2,
          profitCoveragePct: 66.67,
          providerAmountCoveragePct: 66.67,
          legacyFallbackOrders: 1,
          submittedFallbackOrders: 0,
        },
        days: [
          {
            date: '2026-08-15',
            paidOrders: 1,
            codDzd: 10_000,
            feesDzd: 400,
            netRecoveredDzd: 9_600,
            productCostDzd: 5_000,
            profitDzd: 4_600,
            completeOrders: 1,
            providerAmountOrders: 1,
            legacyAmountOrders: 0,
            submittedAmountOrders: 0,
          },
          {
            date: '2026-08-16',
            paidOrders: 2,
            codDzd: 20_000,
            feesDzd: 800,
            netRecoveredDzd: 19_200,
            productCostDzd: 10_000,
            profitDzd: 9_200,
            completeOrders: 1,
            providerAmountOrders: 1,
            legacyAmountOrders: 1,
            submittedAmountOrders: 0,
          },
        ],
      },
      'week',
    );

    expect(series).toEqual([
      expect.objectContaining({
        bucket: '2026-08-14',
        label: '2026-08-14',
        paidOrders: 3,
        codDzd: 30_000,
        feesDzd: 1_200,
        profitDzd: 13_800,
        profitCoveragePct: 66.66666666666666,
        providerAmountCoveragePct: 66.66666666666666,
      }),
    ]);
  });

  it('marks the final paid bucket open only while its calendar period is incomplete', () => {
    const report = {
      days: [
        {
          date: '2026-08-14',
          paidOrders: 1,
          codDzd: 10_000,
          feesDzd: 400,
          netRecoveredDzd: 9_600,
          productCostDzd: 5_000,
          profitDzd: 4_600,
          completeOrders: 1,
          providerAmountOrders: 1,
          legacyAmountOrders: 0,
          submittedAmountOrders: 0,
        },
      ],
    } as never;

    expect(aggregateAutomaticPaidSeries(report, 'week', '2026-08-19')[0]?.isPartial).toBe(true);
    expect(aggregateAutomaticPaidSeries(report, 'week', '2026-08-20')[0]?.isPartial).toBe(false);
  });
});
