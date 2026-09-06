import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import type { AnalyticsPayload } from './analytics';
import { analyticsForAssistant, adminAiAnalyticsQuerySchema } from './ai-analytics';
import {
  adminAiAnalyticsFocusSchemaForView,
  focusAnalyticsForAssistant,
} from './admin-ai-analytics-focus';

function catalogPayload(): AnalyticsPayload {
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
        paidOrders: index,
        projectedContributionDzd: index * 1_000,
        costCoveragePct: 90,
        viewCount: index * 3,
        websiteConversionRate: 4.5,
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
  } as unknown as AnalyticsPayload;
}

describe('admin assistant analytics focus', () => {
  it('keeps parsed fixed focus inputs valid when the query is normalized again', () => {
    const parsed = adminAiAnalyticsQuerySchema.parse({
      view: 'command',
      date: { kind: 'rolling', period: '30d' },
      focus: { dimension: 'signals', limit: 20 },
    });

    expect(parsed.focus).toMatchObject({ dimension: 'signals', identifiers: [], limit: 20 });
    expect(adminAiAnalyticsQuerySchema.safeParse(parsed).success).toBe(true);
    expect(
      adminAiAnalyticsQuerySchema.safeParse({
        view: 'command',
        date: { kind: 'rolling', period: '30d' },
        focus: { dimension: 'signals', search: 'EcoTrack', limit: 20 },
      }).success,
    ).toBe(false);
  });

  it('reports the retained Storefront funnel window instead of the broad workspace range', () => {
    const base = catalogPayload();
    const payload = {
      ...base,
      view: 'storefront',
      filters: { ...base.filters, view: 'storefront' },
      data: {
        kind: 'storefront',
        funnel: [
          { name: 'Sessions', value: 100 },
          { name: 'Submitted-order sessions', value: 8 },
        ],
      },
      effectiveRanges: [
        {
          key: 'storefront',
          startDate: '2026-05-26',
          endDate: '2026-08-19',
          sources: ['orders', 'storefront'],
        },
        {
          key: 'storefront_funnel',
          startDate: '2026-08-13',
          endDate: '2026-08-19',
          sources: ['orders', 'storefront'],
        },
      ],
    } as unknown as AnalyticsPayload;

    expect(
      focusAnalyticsForAssistant(payload, {
        dimension: 'storefront_funnel',
        identifiers: [],
        limit: 20,
      }),
    ).toMatchObject({
      effectiveRange: { startDate: '2026-08-13', endDate: '2026-08-19' },
      effectiveRanges: [
        { key: 'storefront_funnel', startDate: '2026-08-13', endDate: '2026-08-19' },
      ],
    });
  });

  it('labels paid-outcome forecasts as modeled EcoTrack recognition-day evidence', () => {
    const base = catalogPayload();
    const payload = {
      ...base,
      view: 'fulfillment',
      filters: { ...base.filters, view: 'fulfillment' },
      data: {
        kind: 'fulfillment',
        leadingForecast: {
          days: [
            {
              date: '2026-08-24',
              expectedPostedOrders: 4,
              forecastPaidOrders: 7.5,
            },
          ],
        },
      },
      effectiveRanges: [
        {
          key: 'fulfillment',
          startDate: '2026-06-01',
          endDate: '2026-08-23',
          sources: ['orders', 'ecotrack'],
        },
      ],
    } as unknown as AnalyticsPayload;

    const focus = focusAnalyticsForAssistant(payload, {
      dimension: 'leading_forecast',
      identifiers: [],
      limit: 20,
    });

    expect(focus).toMatchObject({
      fieldContract: expect.arrayContaining([
        expect.objectContaining({
          field: 'forecastPaidOrders',
          modeled: true,
          sources: ['orders', 'ecotrack'],
          dateBasis: 'Future EcoTrack paid/archive recognition date.',
          definition: expect.stringContaining('Modeled paid outcomes'),
        }),
      ]),
    });
  });

  it('rejects a drill-down dimension that does not belong to the selected workspace', () => {
    expect(
      adminAiAnalyticsQuerySchema.safeParse({
        view: 'money',
        date: { kind: 'rolling', period: '30d' },
        grain: 'day',
        focus: { dimension: 'products', search: 'hammer' },
      }).success,
    ).toBe(false);
    expect(
      adminAiAnalyticsFocusSchemaForView('money').safeParse({
        dimension: 'paid_funnel',
        limit: 20,
      }).success,
    ).toBe(false);
    expect(
      adminAiAnalyticsFocusSchemaForView('acquisition').safeParse({
        dimension: 'paid_funnel',
        limit: 20,
      }).success,
    ).toBe(true);
  });

  it('advertises focus dimensions only inside their valid workspace branch', () => {
    const schema = z.toJSONSchema(adminAiAnalyticsQuerySchema) as unknown as {
      oneOf: Array<{ properties: { view: { const: string }; focus: unknown } }>;
    };
    const branch = (view: string) =>
      schema.oneOf.find((candidate) => candidate.properties.view.const === view);

    expect(JSON.stringify(branch('money')?.properties.focus)).not.toContain('paid_funnel');
    expect(JSON.stringify(branch('acquisition')?.properties.focus)).toContain('paid_funnel');
  });

  it('adds focused matches while retaining the full canonical dataset', () => {
    const result = analyticsForAssistant(catalogPayload(), {
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
      fieldContract: expect.arrayContaining([
        expect.objectContaining({
          field: 'paidOrders',
          definition: expect.stringContaining('payed or paye_et_archive'),
          sources: ['orders', 'ecotrack'],
          dateBasis: expect.stringContaining('Original first-posted cohort'),
          maturity: expect.stringContaining('Recent cohorts'),
        }),
        expect.objectContaining({
          field: 'projectedContributionDzd',
          unit: 'dzd',
          sources: ['orders', 'assumptions'],
          modeled: true,
          estimation: expect.stringContaining('30% fallback margin'),
        }),
        expect.objectContaining({
          field: 'costCoveragePct',
          unit: 'percent',
          sources: ['orders'],
          definition: expect.stringContaining('immutable order-line purchase-cost'),
        }),
        expect.objectContaining({
          field: 'viewCount',
          sources: ['storefront'],
          dateBasis: expect.stringContaining('Storefront event date'),
        }),
        expect.objectContaining({
          field: 'websiteConversionRate',
          sources: ['orders', 'storefront'],
          dateBasis: expect.stringContaining('shared retained range'),
        }),
      ]),
      rows: [{ id: '50', title: 'Product 50' }],
    });
    expect(result.data).toEqual(catalogPayload().data);
    expect(result.truncations).toEqual([]);
  });

  it('matches exact product identity without treating counts or nested ad IDs as product IDs', () => {
    const payload = catalogPayload();
    const data = payload.data as unknown as { products: Array<Record<string, unknown>> };
    data.products[0]!.metaAssociations = [{ adId: '50' }];
    const focus = focusAnalyticsForAssistant(payload, {
      dimension: 'products',
      identifiers: ['50'],
      limit: 100,
    });
    expect(focus.rows).toEqual([data.products[49]]);
    expect(focus.matched).toBe(1);
    expect(
      focusAnalyticsForAssistant(payload, {
        dimension: 'products',
        identifiers: ['SKU-2'],
        limit: 20,
      }).rows,
    ).toEqual([data.products[1]]);
  });

  it('qualifies zero matches instead of claiming the entity does not exist', () => {
    const focus = focusAnalyticsForAssistant(catalogPayload(), {
      dimension: 'products',
      search: 'Never Listed',
      identifiers: [],
      limit: 20,
    });

    expect(focus).toMatchObject({ matched: 0, included: 0 });
    expect(focus.warning).toContain('does not establish that the entity is absent');
  });

  it('can return up to one hundred focused canonical rows without widening other datasets', () => {
    const result = analyticsForAssistant(catalogPayload(), {
      dimension: 'products',
      identifiers: [],
      limit: 75,
    });

    expect(result.focus?.rows).toHaveLength(75);
    expect(result.focus?.truncated).toBe(false);
  });

  it('returns the matched Meta entity and its related daily series together', () => {
    const payload = {
      ...catalogPayload(),
      view: 'acquisition',
      filters: { ...catalogPayload().filters, view: 'acquisition' },
      data: {
        kind: 'acquisition',
        metrics: [],
        summary: { adCostDzd: 12_000 },
        entities: {
          campaigns: [
            {
              id: 'cmp-1',
              name: 'Alpha',
              spendEur: 120,
              postedOrders: 8,
              paidOrders: 5,
              projectedAdjustedProfitDzd: 34_000,
            },
            { id: 'cmp-2', name: 'Beta', postedOrders: 5 },
          ],
        },
        entityDaily: {
          campaigns: [
            { id: 'cmp-1', name: 'Alpha', day: '2026-08-20', adCostDzd: 4_000 },
            { id: 'cmp-1', name: 'Alpha', day: '2026-08-21', adCostDzd: 5_000 },
            { id: 'cmp-2', name: 'Beta', day: '2026-08-20', adCostDzd: 3_000 },
          ],
        },
      },
      effectiveRanges: [
        {
          key: 'acquisition',
          startDate: '2026-08-20',
          endDate: '2026-08-21',
          sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
        },
      ],
    } as unknown as AnalyticsPayload;

    const result = analyticsForAssistant(payload, {
      dimension: 'campaigns',
      identifiers: ['cmp-1'],
      limit: 20,
    });

    expect(result.focus).toMatchObject({
      rows: [{ id: 'cmp-1', name: 'Alpha' }],
      fieldContract: expect.arrayContaining([
        expect.objectContaining({
          field: 'spendEur',
          sources: ['meta'],
          dateBasis: 'Meta reporting date.',
          attribution: null,
        }),
        expect.objectContaining({
          field: 'postedOrders',
          sources: ['orders'],
          dateBasis: expect.stringContaining('Captured order-attribution date'),
          attribution: expect.stringContaining('2026-08-17'),
        }),
        expect.objectContaining({
          field: 'paidOrders',
          sources: ['orders', 'ecotrack'],
          maturity: expect.stringContaining('Recent cohorts'),
          attribution: expect.stringContaining('2026-08-17'),
        }),
        expect.objectContaining({
          field: 'projectedAdjustedProfitDzd',
          sources: ['orders', 'meta', 'assumptions'],
          modeled: true,
          estimation: expect.stringContaining('30% fallback margin'),
        }),
      ]),
      related: {
        canonicalPath: 'entityDaily.campaigns',
        fieldContract: expect.arrayContaining([
          expect.objectContaining({
            field: 'adCostDzd',
            definition: expect.stringContaining('Meta spend converted'),
            sources: ['meta', 'assumptions'],
            dateBasis: 'Meta reporting date.',
            attribution: null,
          }),
        ]),
        matched: 2,
        rows: [
          { id: 'cmp-1', day: '2026-08-20' },
          { id: 'cmp-1', day: '2026-08-21' },
        ],
      },
    });
    expect(result.data).toMatchObject({ summary: { adCostDzd: 12_000 } });
  });

  it('attaches row-level semantics when one value column spans incompatible lifecycle stages', () => {
    const payload = {
      ...catalogPayload(),
      view: 'acquisition',
      filters: { ...catalogPayload().filters, view: 'acquisition' },
      data: {
        kind: 'acquisition',
        metrics: [],
        funnel: [
          { key: 'impressions', value: 18_000 },
          { key: 'bricOrders', value: 90 },
          { key: 'paid', value: 54 },
        ],
      },
      effectiveRanges: [
        {
          key: 'acquisition',
          startDate: '2026-08-10',
          endDate: '2026-08-21',
          sources: ['orders', 'ecotrack', 'meta', 'assumptions'],
        },
      ],
    } as unknown as AnalyticsPayload;

    const focus = focusAnalyticsForAssistant(payload, {
      dimension: 'paid_funnel',
      identifiers: [],
      limit: 20,
    });

    expect(focus.rowContract).toEqual([
      expect.objectContaining({
        key: 'impressions',
        sources: ['meta'],
        dateBasis: 'Meta reporting date.',
      }),
      expect.objectContaining({
        key: 'bricOrders',
        sources: ['orders'],
        definition: expect.stringContaining('submitted orders'),
        attribution: expect.stringContaining('2026-08-17'),
      }),
      expect.objectContaining({
        key: 'paid',
        sources: ['orders', 'ecotrack'],
        maturity: expect.stringContaining('Recent attributed cohorts'),
        attribution: expect.stringContaining('2026-08-17'),
      }),
    ]);
    expect(focus.fieldContract).toContainEqual(
      expect.objectContaining({
        field: 'value',
        dateBasis: expect.stringContaining('row key'),
      }),
    );
  });
});
