import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Analytics2Payload } from './analytics2';

const { getAnalytics2DataMock } = vi.hoisted(() => ({
  getAnalytics2DataMock: vi.fn(),
}));

vi.mock('./analytics2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./analytics2')>()),
  getAnalytics2Data: getAnalytics2DataMock,
}));

import { adminAiAnalyticsQuerySchemaForPlan, queryAdminAnalytics } from './ai-analytics';

function payload(view: 'storefront' | 'money'): Analytics2Payload {
  return {
    view,
    filters: {
      view,
      range: '30d',
      startDate: '2026-07-25',
      endDate: '2026-08-23',
      grain: 'day',
      resolvedGrain: 'day',
      comparisonStartDate: '2026-06-25',
      comparisonEndDate: '2026-07-24',
    },
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    reviewClock: false,
    data: { kind: view, metrics: [] } as never,
    effectiveRanges: [],
    sources: [],
    warnings: [],
    diagnostics: { queryDurationMs: 20, responseSizeBytes: 100 },
  };
}

describe('admin assistant analytics query execution', () => {
  beforeEach(() => getAnalytics2DataMock.mockReset());

  it('loads the Storefront deferred detail surface for assistant questions', async () => {
    getAnalytics2DataMock.mockResolvedValue(payload('storefront'));

    await queryAdminAnalytics({ view: 'storefront', range: '30d', grain: 'day' });

    expect(getAnalytics2DataMock).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'storefront', range: '30d', grain: 'day' }),
      { includeStorefrontDetails: true },
    );
  });

  it('does not pay the Storefront detail cost for another workspace', async () => {
    getAnalytics2DataMock.mockResolvedValue(payload('money'));

    await queryAdminAnalytics({ view: 'money', range: '30d', grain: 'day' });

    expect(getAnalytics2DataMock).toHaveBeenCalledWith(expect.objectContaining({ view: 'money' }), {
      includeStorefrontDetails: false,
    });
  });

  it('constrains a single-view model call to the application-owned query plan', () => {
    const schema = adminAiAnalyticsQuerySchemaForPlan({
      view: 'storefront',
      range: '30d',
      focus: { dimension: 'storefront_funnel' },
      maxQueries: 1,
      reason: 'Storefront owns its distinct-session funnel.',
    });

    expect(
      schema.safeParse({
        view: 'storefront',
        range: '30d',
        focus: { dimension: 'storefront_funnel' },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        view: 'fulfillment',
        range: '30d',
        focus: { dimension: 'cash_pipeline' },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        view: 'storefront',
        range: '30d',
        focus: { dimension: 'storefront_funnel', search: 'checkout sessions' },
      }).success,
    ).toBe(false);

    const productSchema = adminAiAnalyticsQuerySchemaForPlan({
      view: 'catalog',
      range: '30d',
      focus: { dimension: 'products' },
      maxQueries: 1,
      reason: 'Catalog owns products.',
    });
    expect(
      productSchema.safeParse({
        view: 'catalog',
        range: '30d',
        focus: { dimension: 'products', search: 'Bosch', identifiers: ['12'] },
      }).success,
    ).toBe(true);
  });
});
