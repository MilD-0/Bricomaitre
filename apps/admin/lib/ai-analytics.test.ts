import { describe, expect, it, vi } from 'vitest';

import type { Analytics2Payload } from './analytics2';
import {
  analyticsAnswerRequirements,
  compactAnalytics2ForAssistant,
  queryAdminAnalytics,
  queryAdminAnalyticsInvestigation,
} from './ai-analytics';

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
    } as unknown as Analytics2Payload;

    const result = compactAnalytics2ForAssistant(payload);

    expect(result).toMatchObject({
      kind: 'analytics2',
      responseContractVersion: 4,
      answerRequirements: [expect.stringContaining('shorter effective range')],
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
          estimated: false,
          attributionCoveragePct: null,
          comparisonStatus: 'comparable',
        },
      ],
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
    expect(result.semanticContract).toMatchObject({
      semanticsVersion: 5,
      timezone: 'Africa/Algiers',
      lifecycle: { submitted: expect.stringContaining('never call it a completed sale') },
      materializedFacts: expect.stringContaining('performance cache'),
    });
    expect(((result.data as { metrics: Array<{ name: string }> }).metrics ?? [])[0]?.name).toBe(
      'paidUnits',
    );
    expect((result.data as { products: unknown[] }).products).toHaveLength(20);
    expect(result.truncations).toContainEqual({
      path: 'data.products',
      available: 35,
      included: 20,
    });
  });

  it('places query-specific semantic requirements beside the returned data', () => {
    const requirements = analyticsAnswerRequirements(
      [
        {
          name: 'profitX',
          value: null,
          warning: 'Unavailable because comparable Meta ad cost is zero.',
          estimated: false,
          coveragePct: null,
          requestedRange: { startDate: '2026-08-01', endDate: '2026-08-23' },
          effectiveRange: { startDate: '2026-08-01', endDate: '2026-08-17' },
        },
        {
          name: 'trueProfit',
          value: 145_000,
          warning: null,
          estimated: true,
          coveragePct: 92,
          requestedRange: { startDate: '2026-08-01', endDate: '2026-08-23' },
          effectiveRange: { startDate: '2026-08-01', endDate: '2026-08-17' },
        },
      ] as Parameters<typeof analyticsAnswerRequirements>[0],
      { dimension: 'friday_weeks' },
    );

    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('neither zero nor infinity'),
        expect.stringContaining('partly estimated'),
        expect.stringContaining('no real timestamp moves'),
        expect.stringContaining('shorter effective range'),
      ]),
    );

    expect(analyticsAnswerRequirements([], { dimension: 'meta_daily' })).toContainEqual(
      expect.stringContaining('not proof of causality'),
    );
  });

  it('recomputes multi-workspace evidence over one shared effective range', async () => {
    const load = vi.fn(async (raw: unknown) => {
      const query = raw as { view: 'money' | 'acquisition'; startDate?: string; endDate?: string };
      const aligned = query.startDate === '2026-08-10' && query.endDate === '2026-08-16';
      const range = aligned
        ? { startDate: '2026-08-10', endDate: '2026-08-16' }
        : query.view === 'money'
          ? { startDate: '2026-08-01', endDate: '2026-08-17' }
          : { startDate: '2026-08-10', endDate: '2026-08-16' };
      return {
        kind: 'analytics2' as const,
        query: query.view,
        view: query.view,
        filters: {
          view: query.view,
          range: query.startDate ? 'custom' : '30d',
          startDate: query.startDate ?? '2026-07-25',
          endDate: query.endDate ?? '2026-08-23',
          grain: 'auto',
        },
        effectiveRanges: [
          {
            key: query.view === 'money' ? 'economics' : 'acquisition',
            ...range,
            sources: [],
          },
        ],
        data: { kind: query.view, metrics: [] },
        metrics: [],
        sources: [],
        warnings: [],
        truncations: [],
      } as unknown as Awaited<ReturnType<typeof queryAdminAnalytics>>;
    });

    const result = await queryAdminAnalyticsInvestigation(
      [
        { view: 'money', range: '30d', grain: 'auto' },
        { view: 'acquisition', range: '30d', grain: 'auto' },
      ],
      'Diagnose profit.',
      load,
    );

    expect(result).toMatchObject({
      kind: 'analytics_investigation',
      comparisonStatus: 'aligned',
      requestedRange: { startDate: '2026-07-25', endDate: '2026-08-23' },
      commonEffectiveRange: { startDate: '2026-08-10', endDate: '2026-08-16' },
      originalEffectiveRanges: [
        { view: 'money', startDate: '2026-08-01', endDate: '2026-08-17' },
        { view: 'acquisition', startDate: '2026-08-10', endDate: '2026-08-16' },
      ],
    });
    expect(load).toHaveBeenCalledTimes(4);
    expect(load).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        view: 'money',
        range: 'custom',
        startDate: '2026-08-10',
        endDate: '2026-08-16',
      }),
    );
  });

  it('refuses a comparison when a workspace has no canonical effective range', async () => {
    const load = vi.fn(async (raw: unknown) => {
      const query = raw as { view: 'money' | 'acquisition' };
      return {
        filters: { startDate: '2026-08-01', endDate: '2026-08-23' },
        effectiveRanges:
          query.view === 'money'
            ? [{ key: 'economics', startDate: '2026-08-01', endDate: '2026-08-17' }]
            : [],
      };
    });

    const result = await queryAdminAnalyticsInvestigation(
      [
        { view: 'money', range: '30d' },
        { view: 'acquisition', range: '30d' },
      ],
      'Compare coverage.',
      load,
    );

    expect(result).toMatchObject({
      kind: 'analytics_investigation',
      comparisonStatus: 'unavailable',
      commonEffectiveRange: null,
      originalEffectiveRanges: [
        { view: 'money', startDate: '2026-08-01', endDate: '2026-08-17' },
        { view: 'acquisition', startDate: null, endDate: null },
      ],
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('verifies the effective ranges returned by aligned recomputation', async () => {
    const load = vi.fn(async (raw: unknown) => {
      const query = raw as { view: 'money' | 'acquisition'; range: string };
      const isRecomputed = query.range === 'custom';
      const range =
        query.view === 'money'
          ? { startDate: '2026-08-01', endDate: isRecomputed ? '2026-08-15' : '2026-08-17' }
          : { startDate: '2026-08-01', endDate: '2026-08-16' };
      return {
        filters: { startDate: '2026-08-01', endDate: '2026-08-23' },
        effectiveRanges: [{ key: query.view === 'money' ? 'economics' : 'acquisition', ...range }],
      };
    });

    const result = await queryAdminAnalyticsInvestigation(
      [
        { view: 'money', range: '30d' },
        { view: 'acquisition', range: '30d' },
      ],
      'Compare coverage.',
      load,
    );

    expect(result).toMatchObject({
      kind: 'analytics_investigation',
      comparisonStatus: 'unavailable',
      commonEffectiveRange: null,
    });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('rejects empty or oversized investigation plans before loading data', async () => {
    const load = vi.fn();
    await expect(queryAdminAnalyticsInvestigation([], 'Empty.', load)).rejects.toThrow();
    await expect(
      queryAdminAnalyticsInvestigation(
        [
          { view: 'money', range: '30d' },
          { view: 'acquisition', range: '30d' },
          { view: 'fulfillment', range: '30d' },
          { view: 'storefront', range: '30d' },
        ],
        'Too many.',
        load,
      ),
    ).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
