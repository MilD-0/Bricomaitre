import { describe, expect, it } from 'vitest';

import {
  analyticsQuerySchema,
  loadAutomaticPaidEconomics,
  resolveAnalyticsFilters,
  resolveAnalyticsReferenceNow,
} from './analytics';
import { ANALYTICS_FACT_SEMANTICS_VERSION } from './analytics-fact-contract';
import { finalizeSearchFilters } from './analytics/assumptions-search-views';
import { projectCohortCompletionGroups } from './analytics/cohort-completion';

import { storefrontPathCoverage } from './analytics/commerce-data';
import { clipAnalyticsFilters, dayInTimezone, remainingDayFraction } from './analytics/date-range';
import { economicsSummaryMetrics, materializedFactsAreUsable } from './analytics/economics-data';
import {
  aggregateAutomaticPaidSeries,
  aggregateEconomicsSeries,
} from './analytics/economics-series';
import {
  appendEconomicsForecastSeries,
  buildEconomicsForecast,
  buildLeadingOrderForecast,
  projectOpenEconomicsSeries,
} from './analytics/forecast';
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

  it('backtests its baseline and prevents one exceptional day from driving the forward view', () => {
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 9 + index)).toISOString().slice(0, 10);
      const exceptional = index === 41;
      return {
        date,
        postedOrders: exceptional ? 100 : 2,
        operatingCostDzd: 0,
        trueProfitDzd: exceptional ? 9_990 : 80,
        isRestDay: false,
        grossProfitDzd: exceptional ? 10_000 : 100,
        metrics: {
          adjustedProfitDzd: exceptional ? 10_000 : 90,
          adCostDzd: 10,
        },
      };
    }).reverse();
    const forecast = buildEconomicsForecast(
      { settings: { restFrom: null }, costs: [], days } as unknown as Parameters<
        typeof buildEconomicsForecast
      >[0],
      '2026-08-20',
      7,
    );

    expect(forecast).toHaveLength(7);
    expect(Math.max(...forecast.map((day) => day.forecastTrueProfitDzd))).toBeLessThan(500);
    expect(Math.max(...forecast.map((day) => day.upperTrueProfitDzd))).toBeLessThan(500);
    expect(forecast.every((day) => day.method.startsWith('backtested-'))).toBe(true);
  });

  it('retains weekly commerce shape and widens uncertainty across the horizon', () => {
    const days = Array.from({ length: 56 }, (_, index) => {
      const value = new Date(Date.UTC(2026, 5, 25 + index));
      const date = value.toISOString().slice(0, 10);
      const profitByWeekday = [120, 126, 112, 106, 116, 76, 136];
      const trueProfitDzd = profitByWeekday[value.getUTCDay()]! + index * 0.2;
      return {
        date,
        postedOrders: Math.round(trueProfitDzd / 2),
        operatingCostDzd: 0,
        trueProfitDzd,
        isRestDay: false,
        grossProfitDzd: trueProfitDzd + 25,
        metrics: { adjustedProfitDzd: trueProfitDzd + 10, adCostDzd: 10 },
      };
    }).reverse();
    const forecast = buildEconomicsForecast(
      { settings: { restFrom: null }, costs: [], days } as unknown as Parameters<
        typeof buildEconomicsForecast
      >[0],
      '2026-08-20',
      14,
    );

    expect(
      new Set(forecast.map((day) => Math.round(day.forecastTrueProfitDzd))).size,
    ).toBeGreaterThan(4);
    const intervalWidth = (index: number) =>
      forecast[index]!.upperTrueProfitDzd - forecast[index]!.lowerTrueProfitDzd;
    expect(intervalWidth(13)).toBeGreaterThan(intervalWidth(0) * 1.2);
    expect(
      Math.max(...forecast.map((_day, index) => intervalWidth(index))) /
        Math.min(...forecast.map((_day, index) => intervalWidth(index))),
    ).toBeLessThan(1.6);
  });

  it('adds only the unelapsed share of the current day to an open-period projection', () => {
    const days = Array.from({ length: 14 }, (_, index) => ({
      date: `2026-08-${String(5 + index).padStart(2, '0')}`,
      postedOrders: 10,
      operatingCostDzd: 5,
      trueProfitDzd: 75,
      isRestDay: false,
      grossProfitDzd: 110,
      metrics: { adjustedProfitDzd: 100, adCostDzd: 20 },
    })).reverse();
    const forecast = buildEconomicsForecast(
      { settings: { restFrom: null }, costs: [], days } as unknown as Parameters<
        typeof buildEconomicsForecast
      >[0],
      '2026-08-19',
      1,
      undefined,
      0.75,
    );

    expect(forecast).toHaveLength(2);
    expect(forecast[0]).toMatchObject({
      date: '2026-08-19',
      forecastAdjustedProfitDzd: 75,
      forecastAdCostDzd: 15,
      forecastOperatingCostDzd: 0,
      forecastTrueProfitDzd: 60,
      forecastPostedOrders: 7.5,
      currentDayRemainder: true,
    });
    expect(forecast[1]).toMatchObject({ date: '2026-08-20', currentDayRemainder: false });
  });

  it('trains on the period identity and keeps configured Fridays as rest days', () => {
    const report = {
      settings: { restFrom: '2026-08-01' },
      costs: [],
      days: Array.from({ length: 8 }, (_, index) => ({
        date: `2026-08-${String(11 + index).padStart(2, '0')}`,
        postedOrders: 2,
        operatingCostDzd: 5,
        trueProfitDzd: 9_999,
        isRestDay: false,
        metrics: { adjustedProfitDzd: 100, adCostDzd: 20 },
      })),
    };
    const forecast = buildEconomicsForecast(
      report as unknown as Parameters<typeof buildEconomicsForecast>[0],
      '2026-08-19',
      2,
    );

    expect(forecast[0]).toMatchObject({
      forecastAdjustedProfitDzd: 100,
      forecastAdCostDzd: 20,
      forecastOperatingCostDzd: 0,
      forecastTrueProfitDzd: 80,
    });
    expect(forecast[1]).toMatchObject({
      date: '2026-08-21',
      forecastTrueProfitDzd: 0,
      forecastPostedOrders: 0,
      method: 'configured-rest-day',
    });
  });

  it('uses the probability-weighted live queue as a floor for short-term forecasts', () => {
    const report = {
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
    };
    const leading = buildLeadingOrderForecast({
      asOfDate: '2026-08-19',
      historicalStartDate: '2026-02-01',
      historicalEndDate: '2026-07-29',
      historicalSubmittedOrders: 100,
      historicalConfirmedOrders: 80,
      historicalPostedOrders: 60,
      submittedOrders: 0,
      submittedCodDzd: 0,
      submittedGrossProfitDzd: 0,
      confirmedOrders: 10,
      confirmedCodDzd: 10_000,
      confirmedGrossProfitDzd: 1_000,
      medianSubmittedToPostedHours: 72,
      medianConfirmedToPostedHours: 24,
      planningReturnRatePct: 10,
      restFrom: null,
    });

    const forecast = buildEconomicsForecast(
      report as unknown as Parameters<typeof buildEconomicsForecast>[0],
      '2026-08-19',
      1,
      leading,
    );

    expect(forecast[0]).toMatchObject({
      forecastGrossProfitDzd: 750,
      forecastAdjustedProfitDzd: 675,
      forecastPostedOrders: 7.5,
      knownPipelinePostedOrders: 7.5,
      method: 'historical-baseline-with-pipeline-floor',
    });
  });

  it('completes an open weekly bucket with future-day forecasts instead of charting partial totals', () => {
    const projected = projectOpenEconomicsSeries(
      [
        {
          bucket: '2026-08-14',
          label: '2026-08-14',
          grossProfitDzd: 200,
          adjustedProfitDzd: 160,
          adCostDzd: 40,
          netProfitDzd: 120,
          trueProfitDzd: 110,
          cumulativeNetProfitDzd: 1_120,
          cumulativeTrueProfitDzd: 1_100,
          isPartial: true,
        },
      ] as never,
      [
        {
          date: '2026-08-18',
          forecastGrossProfitDzd: 100,
          forecastAdjustedProfitDzd: 80,
          forecastAdCostDzd: 20,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 55,
        },
        {
          date: '2026-08-19',
          forecastGrossProfitDzd: 120,
          forecastAdjustedProfitDzd: 90,
          forecastAdCostDzd: 30,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 50,
        },
        {
          date: '2026-08-20',
          forecastGrossProfitDzd: 80,
          forecastAdjustedProfitDzd: 70,
          forecastAdCostDzd: 10,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 45,
        },
      ] as never,
      'week',
    )[0];

    expect(projected).toMatchObject({
      trueProfitDzd: 110,
      trueProfitDzdProjected: 260,
      adjustedProfitDzdProjected: 400,
      adCostDzdProjected: 100,
      netProfitDzdProjected: 300,
      cumulativeTrueProfitDzdProjected: 1_250,
      projectionDays: 3,
    });
    expect(projected?.profitXProjected).toBeCloseTo(400 / 100);
  });

  it('appends future buckets as forecast-only economics points', () => {
    const series = appendEconomicsForecastSeries(
      [
        {
          bucket: '2026-08-19',
          label: '2026-08-19',
          netProfitDzd: 60,
          trueProfitDzd: 55,
          cumulativeNetProfitDzd: 600,
          cumulativeTrueProfitDzd: 550,
          isPartial: true,
        },
      ] as never,
      [
        {
          date: '2026-08-20',
          forecastGrossProfitDzd: 100,
          forecastAdjustedProfitDzd: 80,
          forecastAdCostDzd: 20,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 55,
          forecastPostedOrders: 2,
        },
      ] as never,
      'day',
    );

    expect(series.at(-1)).toMatchObject({
      bucket: '2026-08-20',
      trueProfitDzd: null,
      trueProfitDzdProjected: 55,
      cumulativeTrueProfitDzdProjected: 605,
      isForecast: true,
    });
  });

  it('does not chart an incomplete future bucket as a full period', () => {
    const series = appendEconomicsForecastSeries(
      [
        {
          bucket: '2026-08-14',
          label: '2026-08-14',
          netProfitDzd: 60,
          trueProfitDzd: 55,
          cumulativeNetProfitDzd: 600,
          cumulativeTrueProfitDzd: 550,
          isPartial: false,
        },
      ] as never,
      [
        {
          date: '2026-08-21',
          forecastGrossProfitDzd: 100,
          forecastAdjustedProfitDzd: 80,
          forecastAdCostDzd: 20,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 55,
          forecastPostedOrders: 2,
        },
        {
          date: '2026-08-22',
          forecastGrossProfitDzd: 100,
          forecastAdjustedProfitDzd: 80,
          forecastAdCostDzd: 20,
          forecastNetProfitDzd: 60,
          forecastTrueProfitDzd: 55,
          forecastPostedOrders: 2,
        },
      ] as never,
      'week',
    );

    expect(series).toHaveLength(1);
  });
});

describe('analytics materialized fact contract', () => {
  it('rejects stale dependencies, old semantics and incomplete ranges', () => {
    const current = {
      requestedStartDate: '2026-08-10',
      requestedEndDate: '2026-08-17',
      earliestFactDay: '2026-08-10',
      latestFactDay: '2026-08-17',
      hasCompleteDateSpine: true,
      semanticsVersions: [ANALYTICS_FACT_SEMANTICS_VERSION],
      oldestRefresh: '2026-08-20T10:00:00.000Z',
      dependenciesUpdatedAt: '2026-08-20T09:00:00.000Z',
    };
    expect(materializedFactsAreUsable(current)).toBe(true);
    expect(
      materializedFactsAreUsable({
        ...current,
        dependenciesUpdatedAt: '2026-08-20T11:00:00.000Z',
      }),
    ).toBe(false);
    expect(materializedFactsAreUsable({ ...current, semanticsVersions: [1, 2] })).toBe(false);
    expect(materializedFactsAreUsable({ ...current, earliestFactDay: '2026-08-11' })).toBe(false);
    expect(materializedFactsAreUsable({ ...current, hasCompleteDateSpine: false })).toBe(false);
    expect(materializedFactsAreUsable({ ...current, latestFactDay: '2026-08-16' })).toBe(false);
    expect(materializedFactsAreUsable({ ...current, unresolvedFridayRollforward: true })).toBe(
      false,
    );
  });
});

describe('analytics economics aggregation', () => {
  it('subtracts every ad-cost day from a weekly period with projected profit', () => {
    const points = aggregateEconomicsSeries(
      {
        days: [
          {
            date: '2026-08-15',
            postedOrders: 2,
            costCompleteOrders: 2,
            grossProfitDzd: 100_000,
            operatingCostDzd: 2_000,
            metrics: { adjustedProfitDzd: 90_000, adCostDzd: 28_000 },
          },
          {
            date: '2026-08-16',
            postedOrders: 0,
            costCompleteOrders: 0,
            grossProfitDzd: null,
            operatingCostDzd: 1_000,
            metrics: { adjustedProfitDzd: null, adCostDzd: 28_000 },
          },
        ],
        realized: { days: [] },
      } as never,
      'week',
      '2026-08-19',
    );

    expect(points).toEqual([
      expect.objectContaining({
        bucket: '2026-08-14',
        label: '2026-08-14',
        adjustedProfitDzd: 90_000,
        adCostDzd: 56_000,
        netProfitDzd: 34_000,
        trueProfitDzd: 31_000,
        cumulativeNetProfitDzd: 34_000,
        cumulativeTrueProfitDzd: 31_000,
      }),
    ]);
  });
});

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
