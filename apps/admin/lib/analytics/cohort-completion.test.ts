import { describe, expect, it } from 'vitest';

import { resolveAnalyticsFilters } from './date-range';
import { loadCohortCompletionPair, projectCohortCompletionGroups } from './cohort-completion';

describe('grouped cohort completion', () => {
  it('lets final losses override historical delivery while keeping manual completion separate from carrier payout', () => {
    const result = projectCohortCompletionGroups(
      ['retour_archive', 'annule', 'failed', 'manual_completed'].map((outcome) => ({
        postedDay: '2026-08-18',
        outcome,
        delivered: true,
        observedOrders: 2,
        units: 3,
        grossProfitDzd: 100,
        profitSamples: 2,
      })),
      { startDate: '2026-08-18', endDate: '2026-08-18' },
      0.75,
    );
    expect(result).toMatchObject({
      observedOrders: 8,
      unresolvedOrders: 0,
      projectedPaidOrders: 0,
      projectedPaidUnits: 0,
      projectedAdjustedProfitDzd: 100,
      days: [{ projectedPaidOrders: 0, projectedAdjustedProfitDzd: 100 }],
    });
  });
  it('weights grouped orders, units, and missing profit separately across comparison periods', async () => {
    const db = {
      execute: async () => ({
        rows: [
          {
            posted_day: '2026-08-17',
            delivered: false,
            outcome: 'payed',
            observed_orders: 2,
            profit_samples: 2,
            gross_profit_dzd: 90,
            units: 5,
          },
          {
            posted_day: '2026-08-18',
            delivered: false,
            outcome: 'en_livraison',
            observed_orders: 4,
            profit_samples: 2,
            gross_profit_dzd: 100,
            units: 8,
          },
          {
            posted_day: '2026-08-18',
            delivered: true,
            outcome: 'livre_non_encaisse',
            observed_orders: 3,
            profit_samples: 0,
            gross_profit_dzd: null,
            units: 6,
          },
          {
            posted_day: '2026-08-18',
            delivered: false,
            outcome: 'retour_archive',
            observed_orders: 2,
            profit_samples: 2,
            gross_profit_dzd: 80,
            units: 2,
          },
        ],
      }),
    };
    const filters = resolveAnalyticsFilters(
      { view: 'command', range: 'custom', startDate: '2026-08-18', endDate: '2026-08-18' },
      new Date('2026-08-20T12:00:00Z'),
    );
    const result = await loadCohortCompletionPair(db as never, filters, 0.5);
    expect(result?.current).toEqual({
      observedOrders: 9,
      unresolvedOrders: 4,
      projectedPaidOrders: 5,
      projectedPaidUnits: 10,
      projectedAdjustedProfitDzd: 50,
      days: [
        {
          date: '2026-08-18',
          observedOrders: 9,
          projectedPaidOrders: 5,
          projectedAdjustedProfitDzd: 50,
        },
      ],
    });
    expect(result?.previous).toMatchObject({
      observedOrders: 2,
      projectedPaidOrders: 2,
      projectedPaidUnits: 5,
      projectedAdjustedProfitDzd: 90,
    });
  });

  it('keeps profit unknown when no order in a group has a recorded cost', async () => {
    const db = {
      execute: async () => ({
        rows: [
          {
            posted_day: '2026-08-18',
            delivered: false,
            outcome: 'payed',
            observed_orders: 6,
            profit_samples: 0,
            gross_profit_dzd: null,
            units: 9,
          },
        ],
      }),
    };
    const filters = resolveAnalyticsFilters(
      { view: 'command', range: 'all' },
      new Date('2026-08-20T12:00:00Z'),
    );
    const result = await loadCohortCompletionPair(db as never, filters, 0.75);
    expect(result?.current).toMatchObject({
      observedOrders: 6,
      projectedPaidOrders: 6,
      projectedPaidUnits: 9,
      projectedAdjustedProfitDzd: null,
    });
    expect(result?.current.days[0]?.projectedAdjustedProfitDzd).toBeNull();
    expect(result?.previous).toBeNull();
  });
});
