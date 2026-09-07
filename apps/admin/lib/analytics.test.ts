import { describe, expect, it } from 'vitest';

import {
  analyticsQuerySchema,
  resolveAnalyticsFilters,
  resolveAnalyticsReferenceNow,
} from './analytics';
import { finalizeSearchFilters } from './analytics/assumptions-search-views';
import { projectCohortCompletionGroups } from './analytics/cohort-completion';

import { storefrontPathCoverage } from './analytics/commerce-data';
import { clipAnalyticsFilters, dayInTimezone, remainingDayFraction } from './analytics/date-range';
import { economicsSummaryMetrics } from './analytics/economics-data';
import { buildEconomicsForecast, buildLeadingOrderForecast } from './analytics/forecast';
import { metricWithProjectedComparison } from './analytics/loaders-shared';
import { metricChange } from './analytics/metrics';
import { freshnessState } from './analytics/source-health';

describe('analytics filter model', () => {
  it('resolves the Algiers reporting day across the UTC midnight boundary', () => {
    expect(dayInTimezone(new Date('2026-08-30T23:11:00.000Z'))).toBe('2026-08-31');
    expect(remainingDayFraction(new Date('2026-08-30T23:00:00.000Z'))).toBeCloseTo(1);
    expect(remainingDayFraction(new Date('2026-08-31T11:00:00.000Z'))).toBeCloseTo(0.5);
  });

  it('normalizes presets, comparison windows and automatic grain', () => {
    expect(
      resolveAnalyticsFilters(
        { view: 'money', range: '30d', grain: 'auto' },
        new Date('2026-08-19T12:00:00.000Z'),
      ),
    ).toEqual({
      view: 'money',
      range: '30d',
      startDate: '2026-07-21',
      endDate: '2026-08-19',
      grain: 'auto',
      resolvedGrain: 'day',
      comparisonStartDate: '2026-06-21',
      comparisonEndDate: '2026-07-20',
    });
  });

  it('treats Search Visibility as a first-class URL-backed view', () => {
    expect(
      resolveAnalyticsFilters(
        { view: 'search', range: '90d', grain: 'week' },
        new Date('2026-08-20T12:00:00.000Z'),
      ),
    ).toMatchObject({
      view: 'search',
      startDate: '2026-05-23',
      endDate: '2026-08-20',
      resolvedGrain: 'week',
    });
  });

  it('requires explicit valid dates for custom ranges', () => {
    expect(() => resolveAnalyticsFilters({ range: 'custom' })).toThrow();
    expect(() =>
      resolveAnalyticsFilters({
        range: 'custom',
        startDate: '2026-08-20',
        endDate: '2026-08-19',
      }),
    ).toThrow();
  });

  it('honors an explicit upper bound for all-history queries', () => {
    expect(
      resolveAnalyticsFilters(
        { view: 'money', range: 'all', endDate: '2026-08-25' },
        new Date('2026-08-28T12:00:00.000Z'),
      ),
    ).toMatchObject({
      range: 'all',
      startDate: null,
      endDate: '2026-08-25',
      comparisonStartDate: null,
      comparisonEndDate: null,
    });
  });

  it('rejects fields outside the canonical workspace query', () => {
    expect(
      analyticsQuerySchema.safeParse({
        view: 'money',
        range: '30d',
        grain: 'day',
        sql: 'select * from orders',
      }).success,
    ).toBe(false);
  });

  it('does not invent a percentage change from a zero baseline', () => {
    expect(metricChange(12, 0)).toBeNull();
    expect(metricChange(12, null)).toBeNull();
    expect(metricChange(120, 100)).toBe(20);
  });

  it('keeps card values actual while deriving the arrow from projected completion', () => {
    const metric = metricWithProjectedComparison('paidUnits', 299, 761, 'number', {
      value: 790,
      previous: 848,
    });
    expect(metric).toMatchObject({
      value: 299,
      previous: 761,
      comparison: { basis: 'projected_completion', value: 790, previous: 848 },
    });
    expect(metric.changePct).toBeCloseTo(-6.8396);
  });

  it('compares posted cohorts at projected completion without changing the return assumption', () => {
    const projection = projectCohortCompletionGroups(
      [
        {
          postedDay: '2026-08-18',
          delivered: true,
          observedOrders: 1,
          profitSamples: 1,
          outcome: 'livre_non_encaisse',
          grossProfitDzd: 90,
          units: 3,
        },
        {
          postedDay: '2026-08-18',
          delivered: false,
          observedOrders: 1,
          profitSamples: 1,
          outcome: 'paye_et_archive',
          grossProfitDzd: 100,
          units: 2,
        },
        {
          postedDay: '2026-08-18',
          delivered: false,
          observedOrders: 1,
          profitSamples: 1,
          outcome: 'retour_archive',
          grossProfitDzd: 80,
          units: 1,
        },
        {
          postedDay: '2026-08-19',
          delivered: false,
          observedOrders: 1,
          profitSamples: 1,
          outcome: 'en_livraison',
          grossProfitDzd: 200,
          units: 4,
        },
      ],
      { startDate: '2026-08-18', endDate: '2026-08-19' },
      0.75,
    );

    expect(projection).toMatchObject({
      observedOrders: 4,
      unresolvedOrders: 1,
      projectedPaidOrders: 2.75,
      projectedPaidUnits: 8,
      projectedAdjustedProfitDzd: 340,
    });
  });

  it('anchors static-clone review time to the dataset cutoff only when enabled', () => {
    const wallNow = new Date('2026-08-20T12:00:00.000Z');
    expect(resolveAnalyticsReferenceNow('dataset', '2026-08-19', wallNow)).toEqual({
      now: new Date('2026-08-19T12:00:00.000Z'),
      referenceDate: '2026-08-19',
      reviewClock: true,
    });
    expect(resolveAnalyticsReferenceNow(undefined, null, wallNow)).toEqual({
      now: wallNow,
      referenceDate: '2026-08-20',
      reviewClock: false,
    });
  });

  it('derives source state from measured fact cutoffs', () => {
    expect(freshnessState('2026-08-19', '2026-08-19')).toBe('current');
    expect(freshnessState('2026-08-17', '2026-08-19')).toBe('lagged');
    expect(freshnessState('2026-08-15', '2026-08-19')).toBe('partial');
    expect(freshnessState(null, '2026-08-19')).toBe('missing');
  });

  it('matches Search comparisons to the finalized current-period days', () => {
    const filters = resolveAnalyticsFilters(
      { view: 'search', range: '7d', grain: 'day' },
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(finalizeSearchFilters(filters, '2026-08-16')).toMatchObject({
      startDate: '2026-08-14',
      endDate: '2026-08-16',
      comparisonStartDate: '2026-08-11',
      comparisonEndDate: '2026-08-13',
    });
  });

  it('clips combined metrics to their common source cutoff and matches elapsed comparison days', () => {
    const filters = resolveAnalyticsFilters(
      { view: 'money', range: '90d', grain: 'week' },
      new Date('2026-08-19T12:00:00.000Z'),
    );

    expect(clipAnalyticsFilters(filters, '2026-08-17')).toMatchObject({
      startDate: '2026-05-22',
      endDate: '2026-08-17',
      comparisonStartDate: '2026-02-23',
      comparisonEndDate: '2026-05-21',
    });
  });

  it('clips combined metrics to the latest source start without inventing a comparison', () => {
    const filters = resolveAnalyticsFilters(
      { view: 'storefront', range: 'all', grain: 'month' },
      new Date('2026-08-19T12:00:00.000Z'),
    );

    expect(clipAnalyticsFilters(filters, '2026-08-17', '2026-05-22')).toMatchObject({
      startDate: '2026-05-22',
      endDate: '2026-08-17',
      comparisonStartDate: null,
      comparisonEndDate: null,
    });
  });

  it('declares the retained detailed Storefront window separately from a broad range', () => {
    const filters = resolveAnalyticsFilters(
      { view: 'storefront', range: '90d', grain: 'week' },
      new Date('2026-08-19T12:00:00.000Z'),
    );

    expect(storefrontPathCoverage(filters, new Date('2026-08-19T12:00:00.000Z'))).toEqual({
      coverageStartDate: '2026-08-13',
      coverageEndDate: '2026-08-19',
      coverageIsPartial: true,
    });
  });
});

describe('analytics economics headline metrics', () => {
  it('exposes gross profit directly alongside the planning profit ladder', () => {
    const summary = {
      trueProfitDzd: 90_000,
      profitX: 3,
      adjustedProfitDzd: 120_000,
      grossProfitDzd: 150_000,
      rawAdCostDzd: 30_000,
      ratioAdCostDzd: 30_000,
      postedOrders: 25,
    } as never;

    expect(economicsSummaryMetrics(summary, null).map((item) => item.key)).toEqual([
      'trueProfit',
      'profitX',
      'adjustedProfit',
      'grossProfit',
      'adCost',
      'postedOrders',
      'costPerPosted',
    ]);
    expect(economicsSummaryMetrics(summary, null)[3]).toMatchObject({
      key: 'grossProfit',
      value: 150_000,
      unit: 'dzd',
    });
  });
});

describe('analytics forecasting', () => {
  it('weights confirmed and submitted queues with historical funnel conversion', () => {
    const leading = buildLeadingOrderForecast({
      asOfDate: '2026-08-19',
      historicalStartDate: '2026-02-01',
      historicalEndDate: '2026-07-29',
      historicalSubmittedOrders: 100,
      historicalConfirmedOrders: 80,
      historicalPostedOrders: 60,
      submittedOrders: 10,
      submittedCodDzd: 100_000,
      submittedGrossProfitDzd: 30_000,
      confirmedOrders: 10,
      confirmedCodDzd: 100_000,
      confirmedGrossProfitDzd: 30_000,
      medianSubmittedToPostedHours: 72,
      medianConfirmedToPostedHours: 24,
      planningReturnRatePct: 10,
      restFrom: null,
    });

    expect(leading.rates.submittedToConfirmedPct).toBe(80);
    expect(leading.rates.confirmedToPostedPct).toBe(75);
    expect(leading.rates.submittedToPostedPct).toBeCloseTo(60);
    expect(leading.stages.submitted.expectedPostedOrders).toBeCloseTo(6);
    expect(leading.stages.submitted.expectedGrossProfitDzd).toBeCloseTo(18_000);
    expect(leading.stages.submitted.expectedAdjustedProfitDzd).toBeCloseTo(16_200);
    expect(leading.stages.confirmed).toMatchObject({
      expectedPostedOrders: 7.5,
      expectedGrossProfitDzd: 22_500,
      expectedAdjustedProfitDzd: 20_250,
    });
  });

  it('forecasts paid outcomes by recognition day from completed calendar-day history', () => {
    const historicalPaidOutcomeDays = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 5 + index));
      return {
        date: date.toISOString().slice(0, 10),
        paidOrders: date.getUTCDay() === 4 ? 6 : 2,
      };
    });
    const leading = buildLeadingOrderForecast({
      asOfDate: '2026-08-19',
      historicalStartDate: '2026-02-01',
      historicalEndDate: '2026-07-29',
      historicalSubmittedOrders: 100,
      historicalConfirmedOrders: 80,
      historicalPostedOrders: 60,
      paidOutcomeHistory: {
        startDate: historicalPaidOutcomeDays[0]!.date,
        days: historicalPaidOutcomeDays,
      },
      submittedOrders: 0,
      submittedCodDzd: 0,
      submittedGrossProfitDzd: 0,
      confirmedOrders: 0,
      confirmedCodDzd: 0,
      confirmedGrossProfitDzd: 0,
      medianSubmittedToPostedHours: 72,
      medianConfirmedToPostedHours: 24,
      planningReturnRatePct: 10,
      restFrom: null,
    });

    expect(leading.days).toHaveLength(14);
    expect(leading.days[0]).toMatchObject({
      date: '2026-08-20',
      expectedPostedOrders: 0,
      forecastPaidOrders: 6,
    });
    expect(leading.days.slice(1, 7).every((day) => day.forecastPaidOrders === 2)).toBe(true);

    const economics = buildEconomicsForecast(
      {
        settings: { restFrom: null },
        costs: [],
        days: Array.from({ length: 8 }, (_, index) => ({
          date: `2026-08-${String(11 + index).padStart(2, '0')}`,
          postedOrders: 2,
          operatingCostDzd: 0,
          trueProfitDzd: 80,
          isRestDay: false,
          grossProfitDzd: 100,
          metrics: { adjustedProfitDzd: 90, adCostDzd: 10 },
        })),
      } as unknown as Parameters<typeof buildEconomicsForecast>[0],
      '2026-08-19',
      1,
      leading,
    );

    expect(economics[0]?.forecastPaidOrders).toBe(6);
  });

  it('requires enough completed observations and never trains on today', () => {
    const day = (date: string, trueProfitDzd: number, postedOrders = 2) => ({
      date,
      trueProfitDzd,
      postedOrders,
    });
    const sparse = {
      days: Array.from({ length: 6 }, (_, index) => day(`2026-08-0${index + 1}`, 100)),
    };
    expect(
      buildEconomicsForecast(
        sparse as unknown as Parameters<typeof buildEconomicsForecast>[0],
        '2026-08-19',
      ),
    ).toEqual([]);

    const report = {
      days: [
        day('2026-08-19', 99_999),
        day('2026-08-18', 700),
        day('2026-08-17', 600),
        day('2026-08-16', 500),
        day('2026-08-15', 400),
        day('2026-08-14', 300),
        day('2026-08-13', 200),
        day('2026-08-12', 100),
      ],
    };
    const forecast = buildEconomicsForecast(
      report as unknown as Parameters<typeof buildEconomicsForecast>[0],
      '2026-08-19',
      2,
    );
    expect(forecast).toHaveLength(2);
    expect(forecast[0]?.date).toBe('2026-08-20');
    expect(forecast[0]?.forecastTrueProfitDzd).toBeLessThan(1_000);
    expect(forecast[0]?.lowerTrueProfitDzd).toBeLessThanOrEqual(
      forecast[0]?.forecastTrueProfitDzd ?? 0,
    );
    expect(forecast[0]?.upperTrueProfitDzd).toBeGreaterThanOrEqual(
      forecast[0]?.forecastTrueProfitDzd ?? 0,
    );
  });
});
