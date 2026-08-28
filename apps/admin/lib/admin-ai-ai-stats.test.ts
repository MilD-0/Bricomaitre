import { describe, expect, it } from 'vitest';

import type { AiStatsPayload } from './ai-stats';
import { adminAiStatsQuerySchema, compactAiStatsForAssistant } from './admin-ai-ai-stats';

function payload(data: AiStatsPayload['data']): AiStatsPayload {
  return {
    surface: data.kind,
    filters: {
      surface: data.kind,
      range: '30d',
      startDate: '2026-08-01',
      endDate: '2026-08-23',
      grain: 'auto',
      resolvedGrain: 'day',
    },
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    reviewClock: true,
    coverage: { fromDate: '2026-08-01', throughDate: '2026-08-23', records: 20 },
    data,
    diagnostics: { queryDurationMs: 12, responseSizeBytes: 400 },
  };
}

describe('admin AI Stats contract', () => {
  it('advertises one unambiguous date scope instead of combinable ranges and boundaries', () => {
    expect(
      adminAiStatsQuerySchema.safeParse({
        surface: 'shopping',
        date: { kind: 'rolling', period: '14d' },
      }).success,
    ).toBe(true);
    expect(
      adminAiStatsQuerySchema.safeParse({
        surface: 'shopping',
        date: { kind: 'through', date: '2026-08-25' },
      }).success,
    ).toBe(true);
    expect(adminAiStatsQuerySchema.safeParse({ surface: 'shopping', range: '14d' }).success).toBe(
      false,
    );
  });

  it('enriches operations rates with their exact denominator and selected-surface semantics', () => {
    const compact = compactAiStatsForAssistant(
      payload({
        kind: 'operations',
        metrics: [
          { key: 'responseCompletion', value: 90, unit: 'percent', sample: 20 },
          { key: 'helpfulRatings', value: null, unit: 'percent', sample: 0 },
        ],
        summary: {
          interactiveRuns: 22,
          completed: 18,
          failed: 2,
          cancelled: 1,
          running: 1,
          activeOperators: 3,
          validDurationSamples: 20,
          totalTokens: 1_000,
          estimatedCostUsd: 2,
          costCoveragePct: 100,
          assistantAnswers: 20,
          ratedAnswers: 0,
          helpfulAnswers: 0,
          toolCalls: 10,
          completedToolCalls: 9,
        },
        trend: [],
        workflows: [],
        tools: [],
        releases: [],
        changes: [],
        exceptions: [],
      }),
    );

    expect(compact.metrics[0]).toMatchObject({
      name: 'responseCompletion',
      sample: 20,
      denominator: 'Completed plus failed runs.',
    });
    expect(compact.metrics[1].nullMeaning).toContain('never interpret null as zero');
    expect(compact.responseContractVersion).toBe(4);
    expect(compact).not.toHaveProperty('semanticContract');
    expect(compact.data).not.toHaveProperty('metrics');
  });

  it('keeps shopping influence and paid contribution distinct from opens and true profit', () => {
    const compact = compactAiStatsForAssistant(
      payload({
        kind: 'shopping',
        enabled: true,
        metrics: [
          { key: 'confirmedAssisted', value: 8, unit: 'number' },
          { key: 'paidContribution', value: 24_000, unit: 'dzd', sample: 5 },
          { key: 'paidContributionCoverage', value: 100, unit: 'percent', sample: 5 },
        ],
        summary: {
          opens: 50,
          messages: 20,
          resultClicks: 10,
          runs: 20,
          completed: 19,
          failed: 1,
          cancelled: 0,
          activeJourneys: 14,
          ratedAnswers: 3,
          helpfulAnswers: 2,
          p95DurationMs: 900,
          durationSamples: 20,
          estimatedCostUsd: 1,
        },
        journey: [],
        orders: {
          exposed: 12,
          engaged: 10,
          recommendationClicked: 6,
          recommendedProductOrdered: 4,
          confirmedAssisted: 8,
          paidAssisted: 5,
          paidContributionDzd: 24_000,
          contributionCoveragePct: 100,
        },
        trend: [],
        intents: [],
      }),
    );

    expect(compact.metrics[0].exclusions).toContain(
      'Opening the assistant alone is not assisted-order engagement.',
    );
    expect(compact.metrics[1].definition).toContain('not whole-business true profit');
    expect(compact.metrics[2]).toMatchObject({
      name: 'paidContributionCoverage',
      value: 100,
      sample: 5,
      denominator: 'All paid assistant-influenced orders in the selected order-created cohort.',
    });
    expect(compact).not.toHaveProperty('semanticContract');
  });
});
