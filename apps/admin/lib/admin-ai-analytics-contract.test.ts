import { describe, expect, it } from 'vitest';

import type { AnalyticsPayload } from './analytics';
import {
  ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE,
  ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
  analyticsMetricsForAssistant,
} from './admin-ai-analytics-contract';

function moneyPayload(costCoveragePct: number): AnalyticsPayload {
  return {
    view: 'money',
    filters: {
      view: 'money',
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
    data: {
      kind: 'money',
      metrics: [
        {
          key: 'trueProfit',
          value: 140_000,
          previous: 100_000,
          changePct: 40,
          unit: 'dzd',
          goodWhen: 'up',
        },
      ],
      series: [],
      performanceSeries: [],
      realized: {
        summary: {
          settledOrders: 0,
          offPipelineSales: 0,
          amountCollectedDzd: 0,
          netRevenueDzd: 0,
          feesDzd: 0,
          realizedProfitDzd: 0,
          knownMetaAdCostDzd: 0,
          realizedProfitAfterAdsDzd: 0,
          metaCoveredDays: 0,
          postedOrders: 0,
          settlementCoveragePct: null,
        },
        days: [],
        reportThroughDate: null,
      },
      coverage: {
        projectedOrders: 0,
        costCompleteOrders: 0,
        projectedCoveragePct: costCoveragePct,
        settledOrders: 0,
        settlementCoveragePct: null,
        metaDays: 0,
        pendingRollforwardDzd: 0,
      },
      automaticPaid: {
        summary: {
          paidOrders: 0,
          codDzd: 0,
          feesDzd: 0,
          netRecoveredDzd: 0,
          productCostDzd: 0,
          profitDzd: 0,
          completeOrders: 0,
          profitCoveragePct: null,
          providerAmountCoveragePct: null,
          legacyFallbackOrders: 0,
          submittedFallbackOrders: 0,
        },
        days: [],
      },
      paidSeries: [],
      cohorts: [],
      forecast: [],
      weeks: [],
    },
    effectiveRanges: [
      {
        key: 'economics',
        startDate: '2026-07-25',
        endDate: '2026-08-17',
        sources: ['orders', 'meta', 'assumptions'],
      },
    ],
    sources: [
      {
        key: 'orders',
        state: 'current',
        updatedAt: '2026-08-23T10:00:00.000Z',
        throughDate: '2026-08-19',
        records: 200,
        coveragePct: 100,
      },
      {
        key: 'meta',
        state: 'partial',
        updatedAt: '2026-08-18T10:00:00.000Z',
        throughDate: '2026-08-17',
        records: 24,
        coveragePct: 80,
      },
      {
        key: 'assumptions',
        state: 'manual',
        updatedAt: null,
        throughDate: null,
        records: 0,
        coveragePct: 100,
      },
    ],
    warnings: [],
    diagnostics: { queryDurationMs: 42, responseSizeBytes: 1_000 },
  } satisfies AnalyticsPayload;
}

describe('admin assistant analytics semantic contract', () => {
  it('defines both EcoTrack paid outcomes without promising bank receipt', () => {
    expect(ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.lifecycle.payed).toContain(
      'recognized paid outcome',
    );
    expect(ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.lifecycle.payeEtArchive).toContain(
      'paid processing/archive outcome',
    );
  });

  it('encodes the Bricomaitre meanings that conventional ecommerce assistants get wrong', () => {
    expect(ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT).toMatchObject({
      lifecycle: {
        delivered: expect.stringContaining('not proof'),
        payed: expect.stringContaining('recognized paid outcome'),
        untracked: expect.stringContaining('untracked'),
      },
      returnPolicy: { adoption: expect.stringContaining('explicit user action') },
      storefront: expect.stringContaining('distinct sessions'),
      metaAttribution: expect.stringContaining('2026-08-17'),
    });
    expect(ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT).not.toHaveProperty('hardRules');
  });

  it('owns one state-aware profit explanation for metrics and conceptual answers', () => {
    expect(ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.profit).toBe(ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE);
    expect(ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.adjustedProfit).toContain(
      'only to that unresolved/shipping portion',
    );
    expect(ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.unresolvedContribution).toContain(
      'local posted status 11',
    );
    expect(ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE.unresolvedContribution).toContain(
      'Orders that never reached posted status 11 do not enter',
    );
  });

  it('declares exact-cost coverage and assumptions without an ambiguous estimation flag', () => {
    const [metric] = analyticsMetricsForAssistant(moneyPayload(95));

    expect(metric).toMatchObject({
      name: 'trueProfit',
      effectiveRange: { startDate: '2026-07-25', endDate: '2026-08-17' },
      asOf: '2026-08-17',
      coveragePct: 95,
      comparisonStatus: 'comparable',
      comparisonReason: expect.stringContaining('Matched prior-period'),
    });
    expect(metric.assumptions).toContain(
      '30% fallback margin for missing immutable purchase costs',
    );
    expect(metric).not.toHaveProperty('estimated');
    expect(metric.warning).toContain('meta is partial');
    expect(metric.warning).not.toContain('Exact purchase-cost coverage');
  });

  it('warns when a result materially depends on uncovered costs', () => {
    const [metric] = analyticsMetricsForAssistant(moneyPayload(92));

    expect(metric.warning).toContain('92.0%');
    expect(metric.warning).toContain('30% estimated margin');
  });

  it('explains a canonical gross-profit headline without return or ad assumptions', () => {
    const payload = moneyPayload(100);
    payload.data.metrics = [
      {
        key: 'grossProfit',
        value: 180_000,
        previous: 150_000,
        changePct: 20,
        unit: 'dzd',
      },
    ];

    const [metric] = analyticsMetricsForAssistant(payload);

    expect(metric).toMatchObject({
      name: 'grossProfit',
      definition: expect.stringContaining('before return assumptions and advertising'),
      coveragePct: 100,
      assumptions: [],
    });
  });

  it('does not mistake assumptions-source coverage for exact product-cost coverage', () => {
    const payload = moneyPayload(88);
    const assumptions = payload.sources.find((source) => source.key === 'assumptions');
    if (assumptions) assumptions.coveragePct = 12;

    const [metric] = analyticsMetricsForAssistant(payload);

    expect(metric.coveragePct).toBe(88);
  });

  it('explains unavailable comparisons and zero-spend Profit X without inventing zeros', () => {
    const payload = moneyPayload(100);
    payload.data.metrics = [
      {
        key: 'profitX',
        value: null,
        previous: null,
        changePct: null,
        unit: 'ratio',
      },
      { key: 'adCost', value: 0, previous: null, changePct: null, unit: 'dzd' },
    ];

    const [metric] = analyticsMetricsForAssistant(payload);

    expect(metric).toMatchObject({
      comparisonStatus: 'unavailable',
      comparisonReason: expect.stringContaining('must not be read as zero'),
      warning: expect.stringContaining('neither zero nor infinity'),
    });
  });
});
