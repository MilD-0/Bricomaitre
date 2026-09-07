import { describe, expect, it } from 'vitest';

import type { AnalyticsPayload } from './analytics';
import { analyticsForAssistant } from './ai-analytics';

describe('admin assistant Analytics adapter', () => {
  it('preserves canonical metrics, comparisons, sources, and warnings', () => {
    const payload = {
      view: 'catalog',
      filters: {
        view: 'catalog',
        range: '90d',
        startDate: '2026-05-26',
        endDate: '2026-08-23',
        grain: 'week',
        resolvedGrain: 'week',
        comparisonStartDate: '2026-02-25',
        comparisonEndDate: '2026-05-25',
      },
      generatedAt: '2026-08-23T00:00:00.000Z',
      referenceDate: '2026-08-23',
      reviewClock: false,
      data: {
        kind: 'catalog',
        metrics: [
          {
            key: 'paidUnits',
            value: 120,
            previous: 100,
            changePct: 20,
            unit: 'number',
            goodWhen: 'up',
          },
        ],
        products: Array.from({ length: 35 }, (_, index) => ({
          id: String(index + 1),
          title: `Product ${index + 1} ${'x'.repeat(3_000)}`,
          sku: null,
          categoryName: null,
          brandName: null,
          postedOrders: 35 - index,
          postedUnits: 35 - index,
          paidOrders: index,
          returnedOrders: 0,
          activeOrders: 0,
          terminalPaidRatePct: null,
          costCoveragePct: 100,
          projectedContributionDzd: 0,
          deliveryMedianHours: null,
          metaAssociations: [],
          viewCount: 0,
          websiteConversionRate: 0,
          changes: { unitsPct: null },
        })),
        coverage: {
          projectedOrders: 0,
          costCompleteOrders: 0,
          projectedCoveragePct: 100,
          settledOrders: 0,
          settlementCoveragePct: null,
          metaDays: 0,
          pendingRollforwardDzd: 0,
        },
        basketPairs: [],
        geography: { wilayas: [], communes: [], metaRegions: [] },
        customers: {
          summary: {
            customers: 0,
            repeatCustomers: 0,
            repeatRate: 0,
            secondOrderConversionPct: 0,
            secondOrderEligibleCustomers: 0,
            secondOrderConvertedCustomers: 0,
            secondOrderWindowDays: 30,
            averageOrders: 0,
            averageOrderValue: 0,
            medianReorderIntervalDays: null,
            averageContributionLtvDzd: null,
            acquisitionPaybackPct: null,
            acquisitionCoveragePct: null,
          },
          rows: [],
        },
      },
      effectiveRanges: [
        {
          key: 'catalog',
          startDate: '2026-06-01',
          endDate: '2026-08-19',
          sources: ['orders', 'ecotrack', 'assumptions'],
        },
      ],
      sources: [
        {
          key: 'orders',
          state: 'current',
          updatedAt: '2026-08-23T00:00:00.000Z',
          throughDate: '2026-08-23',
          records: 500,
          coveragePct: 100,
        },
      ],
      warnings: [{ key: 'projectedCostCoverage', value: 92 }],
      diagnostics: { queryDurationMs: 42, responseSizeBytes: 10_000 },
    } satisfies AnalyticsPayload;

    const result = analyticsForAssistant(payload);

    expect(result).toMatchObject({
      kind: 'analytics',
      responseContractVersion: 6,
      query: 'catalog',
      view: 'catalog',
      effectiveRanges: [{ key: 'catalog', startDate: '2026-06-01', endDate: '2026-08-19' }],
      metrics: [
        {
          name: 'paidUnits',
          definition: expect.stringContaining('payed'),
          requestedRange: { startDate: '2026-05-26', endDate: '2026-08-23' },
          effectiveRange: { startDate: '2026-06-01', endDate: '2026-08-19' },
          dateBasis: expect.stringContaining('first-posted'),
          asOf: '2026-08-23',
          coveragePct: null,
          attributionCoveragePct: null,
          comparisonStatus: 'comparable',
        },
      ],
      data: {
        kind: 'catalog',
      },
      sources: [{ key: 'orders', state: 'current', coveragePct: 100 }],
      warnings: [{ key: 'projectedCostCoverage', value: 92 }],
    });
    expect(result).not.toHaveProperty('semanticContract');
    expect(result.data).toEqual(payload.data);
    expect(result.truncations).toEqual([]);
  });

  it('compacts analytics data only when limits are configured', () => {
    const payload = {
      view: 'search',
      filters: {
        view: 'search',
        range: '7d',
        startDate: '2026-08-17',
        endDate: '2026-08-23',
        grain: 'day',
        resolvedGrain: 'day',
        comparisonStartDate: null,
        comparisonEndDate: null,
      },
      generatedAt: '2026-08-23T00:00:00.000Z',
      referenceDate: '2026-08-23',
      reviewClock: false,
      data: {
        kind: 'search',
        metrics: [],
        queries: [{ query: 'abcdefgh' }, { query: 'second' }, { query: 'third' }],
      },
      effectiveRanges: [],
      sources: [],
      warnings: [],
      diagnostics: {},
    } as unknown as AnalyticsPayload;

    const result = analyticsForAssistant(payload, undefined, {
      arrayLimit: 2,
      stringLimit: 4,
      maxDepth: 8,
    });

    expect(result.data).toMatchObject({
      kind: 'sea…',
      queries: [{ query: 'abc…' }, { query: 'sec…' }],
    });
    expect(result.truncations).toContainEqual({
      path: 'data.queries',
      available: 3,
      included: 2,
    });
  });
});
