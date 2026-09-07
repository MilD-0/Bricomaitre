import { expect, it } from 'vitest';
import {
  applyProfitTrackerRollforward,
  calculateProfitAmounts,
  dayProfitsSuppressed,
  summarizeProfitTracker,
} from '../profit-tracker-metrics';
import type { getProfitTrackerReport } from '../profit-tracker';
import { aggregateEconomicsSeries } from './economics-series';
import { appendEconomicsForecastSeries, buildEconomicsForecast } from './forecast';

type Report = Awaited<ReturnType<typeof getProfitTrackerReport>>;
function report(returnRates: number[], globalRate: number) {
  const settings = { fxRate: 100, defaultReturnRate: globalRate, restFrom: null };
  const costs = [
    {
      name: 'Operations',
      amountDzd: 300,
      period: 'monthly' as const,
      startDate: '2040-09-01',
      endDate: null,
    },
  ];
  const days = applyProfitTrackerRollforward(
    returnRates.map((returnRatePct, index) => ({
      date: `2040-09-${String(index + 1).padStart(2, '0')}`,
      spendEur: 1,
      grossProfitDzd: 1000,
      confirmedOrders: 1,
      fxRateUsed: 100,
      returnRatePct,
      fbPurchases: null,
      cpm: null,
      ctr: null,
      linkClicks: null,
      landingPageViews: null,
      note: null,
      postedOrders: 1,
      costCompleteOrders: 1,
    })),
    settings,
  ).map((day) => ({
    ...day,
    operatingCostDzd: 10,
    trueProfitDzd: calculateProfitAmounts({
      adjustedProfitDzd: day.metrics.adjustedProfitDzd,
      adCostDzd: day.metrics.adCostDzd,
      operatingCostDzd: 10,
      profitsSuppressed: dayProfitsSuppressed(day),
    }).trueProfitDzd,
  }));
  return { days, settings, costs, realized: { days: [] } } as unknown as Report;
}

it('sums only unsuppressed profit contributions while preserving every day’s costs', () => {
  const input = report([10, 100], 10);
  const summary = summarizeProfitTracker(input.days, input.costs, '2040-09-01', '2040-09-02');
  expect(summary).toMatchObject({
    rawAdCostDzd: 200,
    ratioAdCostDzd: 200,
    operatingCostDzd: 20,
    adjustedProfitDzd: 900,
    netProfitDzd: 800,
    trueProfitDzd: 790,
    confirmedOrders: 2,
  });
  const series = aggregateEconomicsSeries(input, 'month', '2040-09-02');
  expect(series[0]).toMatchObject({
    grossProfitDzd: 2000,
    adCostDzd: 200,
    adjustedProfitDzd: 900,
    netProfitDzd: 800,
    trueProfitDzd: 790,
  });
});

it('keeps suppression through forecast and open/future chart buckets despite manual percentages', () => {
  const input = report(
    Array.from({ length: 8 }, () => 10),
    100,
  );
  expect(input.days.every((day) => day.metrics.netProfitDzd === 0 && day.trueProfitDzd === 0)).toBe(
    true,
  );
  const forecast = buildEconomicsForecast(input, '2040-09-09', 14);
  expect(forecast).toHaveLength(14);
  for (const day of forecast) {
    expect(day).toMatchObject({
      forecastAdjustedProfitDzd: 0,
      forecastNetProfitDzd: 0,
      forecastTrueProfitDzd: 0,
      lowerTrueProfitDzd: 0,
      upperTrueProfitDzd: 0,
    });
    expect(day.forecastAdCostDzd).toBe(100);
  }
  for (const grain of ['day', 'week'] as const) {
    const series = appendEconomicsForecastSeries(
      aggregateEconomicsSeries(input, grain, '2040-09-09'),
      forecast,
      grain,
    );
    expect(series.some((point) => point.isForecast)).toBe(true);
    for (const point of series)
      for (const value of [
        point.netProfitDzd,
        point.trueProfitDzd,
        point.netProfitDzdProjected,
        point.trueProfitDzdProjected,
        point.profitXBeforeReturnsProjected,
      ]) {
        if (value !== null) expect(value).toBe(0);
      }
  }
});
