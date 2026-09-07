import { describe, expect, it } from 'vitest';

import { ANALYTICS_FACT_SEMANTICS_VERSION } from './analytics-fact-contract';

import { materializedFactsAreUsable } from './analytics/economics-data';
import { aggregateEconomicsSeries } from './analytics/economics-series';
import {
  appendEconomicsForecastSeries,
  buildEconomicsForecast,
  buildLeadingOrderForecast,
  projectOpenEconomicsSeries,
} from './analytics/forecast';

describe('analytics forecasting', () => {
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
