import { describe, expect, it } from 'vitest';

import type { Analytics2Payload } from './analytics2';
import { compactAnalytics2ForAssistant } from './ai-analytics';

describe('admin assistant Analytics2 adapter', () => {
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
    } as unknown as Analytics2Payload;

    const result = compactAnalytics2ForAssistant(payload);

    expect(result).toMatchObject({
      kind: 'analytics2',
      query: 'catalog',
      view: 'catalog',
      data: {
        kind: 'catalog',
        metrics: [
          {
            key: 'paidUnits',
            value: 120,
            previous: 100,
            changePct: 20,
            unit: 'number',
          },
        ],
      },
      sources: [{ key: 'orders', state: 'current', coveragePct: 100 }],
      warnings: [{ key: 'projectedCostCoverage', value: 92 }],
    });
    expect((result.data as { products: unknown[] }).products).toHaveLength(20);
    expect(result.truncations).toContainEqual({
      path: 'data.products',
      available: 35,
      included: 20,
    });
  });
});
