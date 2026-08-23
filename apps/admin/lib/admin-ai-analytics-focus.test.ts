import { describe, expect, it } from 'vitest';

import type { Analytics2Payload } from './analytics2';
import { compactAnalytics2ForAssistant, adminAiAnalyticsQuerySchema } from './ai-analytics';
import { focusAnalytics2ForAssistant } from './admin-ai-analytics-focus';

function catalogPayload(): Analytics2Payload {
  return {
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
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    reviewClock: false,
    data: {
      kind: 'catalog',
      metrics: [
        {
          key: 'postedUnits',
          value: 750,
          previous: 500,
          changePct: 50,
          unit: 'number',
          goodWhen: 'up',
        },
      ],
      products: Array.from({ length: 75 }, (_, index) => ({
        id: String(index + 1),
        title: `Product ${index + 1}`,
        sku: `SKU-${index + 1}`,
        postedUnits: 75 - index,
      })),
      basketPairs: [],
      geography: { wilayas: [], communes: [], metaRegions: [] },
      customers: { summary: {}, rows: [] },
    },
    effectiveRanges: [
      {
        key: 'catalog',
        startDate: '2026-06-01',
        endDate: '2026-08-19',
        sources: ['orders', 'ecotrack', 'assumptions'],
      },
      {
        key: 'catalogStorefront',
        startDate: '2026-06-10',
        endDate: '2026-08-20',
        sources: ['orders', 'storefront'],
      },
    ],
    sources: [
      {
        key: 'orders',
        state: 'current',
        updatedAt: '2026-08-23T10:00:00.000Z',
        throughDate: '2026-08-23',
        records: 750,
        coveragePct: 100,
      },
    ],
    warnings: [],
    diagnostics: { queryDurationMs: 30, responseSizeBytes: 10_000 },
  } as Analytics2Payload;
}

describe('admin assistant analytics focus', () => {
  it('rejects a drill-down dimension that does not belong to the selected workspace', () => {
    expect(
      adminAiAnalyticsQuerySchema.safeParse({
        view: 'money',
        range: '30d',
        grain: 'day',
        focus: { dimension: 'products', search: 'hammer' },
      }).error?.issues[0]?.message,
    ).toContain('products is available in catalog, not money');
  });

  it('finds exact rows beyond the generic twenty-row compaction boundary', () => {
    const result = compactAnalytics2ForAssistant(catalogPayload(), {
      dimension: 'products',
      search: 'Product 50',
      identifiers: [],
      limit: 10,
    });

    expect(result.focus).toMatchObject({
      dimension: 'products',
      available: 75,
      matched: 1,
      included: 1,
      effectiveRange: { startDate: '2026-06-01', endDate: '2026-08-19' },
      effectiveRanges: [
        { key: 'catalog', startDate: '2026-06-01', endDate: '2026-08-19' },
        { key: 'catalogStorefront', startDate: '2026-06-10', endDate: '2026-08-20' },
      ],
      totalSemantics: expect.stringContaining('not the complete population'),
      rows: [{ id: '50', title: 'Product 50' }],
    });
    expect(result.data).toMatchObject({
      kind: 'catalog',
      focus: { rows: [{ id: '50' }] },
    });
    expect((result.data as Record<string, unknown>).products).toBeUndefined();
    expect(result.truncations).toEqual([]);
  });

  it('qualifies zero matches instead of claiming the entity does not exist', () => {
    const focus = focusAnalytics2ForAssistant(catalogPayload(), {
      dimension: 'products',
      search: 'Never Listed',
      identifiers: [],
      limit: 20,
    });

    expect(focus).toMatchObject({ matched: 0, included: 0 });
    expect(focus.warning).toContain('does not establish that the entity is absent');
  });

  it('can return up to one hundred focused canonical rows without widening other datasets', () => {
    const result = compactAnalytics2ForAssistant(catalogPayload(), {
      dimension: 'products',
      identifiers: [],
      limit: 75,
    });

    expect(result.focus?.rows).toHaveLength(75);
    expect(result.focus?.truncated).toBe(false);
  });
});
