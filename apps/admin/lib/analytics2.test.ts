import { describe, expect, it } from 'vitest';

import {
  aggregateAutomaticPaidSeries,
  buildEconomicsForecast,
  metricChange,
  resolveAnalytics2ReferenceNow,
  resolveAnalytics2Filters,
} from './analytics2';

describe('analytics2 filter model', () => {
  it('normalizes presets, comparison windows and automatic grain', () => {
    expect(
      resolveAnalytics2Filters(
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
      resolveAnalytics2Filters(
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
    expect(() => resolveAnalytics2Filters({ range: 'custom' })).toThrow();
    expect(() =>
      resolveAnalytics2Filters({
        range: 'custom',
        startDate: '2026-08-20',
        endDate: '2026-08-19',
      }),
    ).toThrow();
  });

  it('does not invent a percentage change from a zero baseline', () => {
    expect(metricChange(12, 0)).toBeNull();
    expect(metricChange(12, null)).toBeNull();
    expect(metricChange(120, 100)).toBe(20);
  });

  it('anchors static-clone review time to the dataset cutoff only when enabled', () => {
    const wallNow = new Date('2026-08-20T12:00:00.000Z');
    expect(resolveAnalytics2ReferenceNow('dataset', '2026-08-19', wallNow)).toEqual({
      now: new Date('2026-08-19T12:00:00.000Z'),
      referenceDate: '2026-08-19',
      reviewClock: true,
    });
    expect(resolveAnalytics2ReferenceNow(undefined, null, wallNow)).toEqual({
      now: wallNow,
      referenceDate: '2026-08-20',
      reviewClock: false,
    });
  });
});

describe('analytics2 forecasting', () => {
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

describe('automatic paid economics', () => {
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
        paidOrders: 3,
        codDzd: 30_000,
        feesDzd: 1_200,
        profitDzd: 13_800,
        profitCoveragePct: 66.66666666666666,
        providerAmountCoveragePct: 66.66666666666666,
      }),
    ]);
  });
});
