import { describe, expect, it } from 'vitest';

import type { AnalyticsPayload } from './analytics';
import { compactAnalyticsForAssistant } from './ai-analytics';

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
          title: `Product ${index + 1}`,
        })),
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
    } as unknown as AnalyticsPayload;

    const result = compactAnalyticsForAssistant(payload);

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
    expect(result.data).not.toHaveProperty('metrics');
    expect((result.data as { products: unknown[] }).products).toHaveLength(20);
    expect(result.truncations).toContainEqual({
      path: 'data.products',
      available: 35,
      included: 20,
    });
  });
});
