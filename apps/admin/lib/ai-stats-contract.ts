import { sql, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  type AnalyticsGrain,
  type AnalyticsRange,
  type AnalyticsResolvedGrain,
} from './analytics';

export type Database = ReturnType<typeof getDb>;

const aiStatsSurfaces = ['operations', 'shopping'] as const;
export type AiStatsSurface = (typeof aiStatsSurfaces)[number];
export type AiStatsRange = AnalyticsRange;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateOnlySchema = z.string().regex(ISO_DATE_PATTERN);

export const aiStatsQuerySchema = z
  .object({
    surface: z.enum(aiStatsSurfaces).default('operations'),
    range: z.enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']).default('30d'),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    grain: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
        path: ['startDate'],
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
        path: ['startDate'],
      });
    }
  });

export type AiStatsQuery = z.input<typeof aiStatsQuerySchema>;

export type AiStatsFilters = {
  surface: AiStatsSurface;
  range: AnalyticsRange;
  startDate: string | null;
  endDate: string;
  grain: AnalyticsGrain;
  resolvedGrain: AnalyticsResolvedGrain;
};

export type AiStatsMetric = {
  key: string;
  value: number | null;
  unit: 'number' | 'percent' | 'milliseconds' | 'usd' | 'dzd';
  sample?: number | null;
};

export type AiOperationsStats = {
  kind: 'operations';
  metrics: AiStatsMetric[];
  summary: {
    interactiveRuns: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    activeOperators: number;
    validDurationSamples: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
    costCoveragePct: number | null;
    assistantAnswers: number;
    ratedAnswers: number;
    helpfulAnswers: number;
    toolCalls: number;
    completedToolCalls: number;
  };
  trend: Array<{
    bucket: string;
    runs: number;
    completed: number;
    failed: number;
    cancelled: number;
    tokens: number;
  }>;
  workflows: Array<{
    task: string;
    mode: AiWorkloadMode;
    runs: number;
    completed: number;
    failed: number;
    cancelled: number;
    completionPct: number | null;
    p95DurationMs: number | null;
    tokens: number;
    estimatedCostUsd: number | null;
  }>;
  tools: Array<{
    name: string;
    calls: number;
    completed: number;
    failed: number;
    completionPct: number | null;
    p95DurationMs: number | null;
  }>;
  releases: Array<{
    promptVersion: string;
    model: string;
    runs: number;
    completed: number;
    failed: number;
    cancelled: number;
    completionPct: number | null;
    p95DurationMs: number | null;
    tokens: number;
    estimatedCostUsd: number | null;
  }>;
  changes: Array<{ type: string; status: string; count: number }>;
  exceptions: Array<{
    id: number;
    startedAt: string;
    task: string;
    model: string;
    promptVersion: string;
    status: string;
    errorCode: string | null;
  }>;
};

export type AiShoppingStats = {
  kind: 'shopping';
  enabled: boolean;
  metrics: AiStatsMetric[];
  summary: {
    opens: number;
    messages: number;
    resultClicks: number;
    runs: number;
    completed: number;
    failed: number;
    cancelled: number;
    activeJourneys: number;
    ratedAnswers: number;
    helpfulAnswers: number;
    p95DurationMs: number | null;
    durationSamples: number;
    estimatedCostUsd: number | null;
  };
  journey: Array<{ key: string; value: number }>;
  orders: {
    exposed: number;
    engaged: number;
    recommendationClicked: number;
    recommendedProductOrdered: number;
    confirmedAssisted: number;
    paidAssisted: number;
    paidContributionDzd: number;
    contributionCoveragePct: number | null;
  };
  trend: Array<{
    bucket: string;
    opens: number;
    messages: number;
    resultClicks: number;
    runs: number;
    failed: number;
  }>;
  intents: Array<{
    name: string;
    messages: number;
    runs: number;
    completed: number;
    resultClicks: number;
    completionPct: number | null;
  }>;
};

export type AiStatsPayload = {
  surface: AiStatsSurface;
  filters: AiStatsFilters;
  generatedAt: string;
  referenceDate: string;
  reviewClock: boolean;
  coverage: {
    fromDate: string | null;
    throughDate: string | null;
    records: number;
  };
  data: AiOperationsStats | AiShoppingStats;
  diagnostics: { queryDurationMs: number; responseSizeBytes: number };
};

export type AiWorkloadMode = 'interactive' | 'deterministic' | 'batch';

export function classifyAiWorkload(task: string, model: string): AiWorkloadMode {
  if (task === 'admin_chat') return 'interactive';
  if (model.startsWith('deterministic')) return 'deterministic';
  return 'batch';
}

export function aiRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;
}

export function isAssistedInfluenceLevel(level: string | null | undefined) {
  return (
    level === 'engaged' ||
    level === 'recommendation_clicked' ||
    level === 'recommended_product_ordered'
  );
}

export function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function rows(result: Awaited<ReturnType<Database['execute']>>) {
  return result.rows as Array<Record<string, unknown>>;
}

export function timestampCondition(column: SQLWrapper, filters: AiStatsFilters) {
  return filters.startDate
    ? sql`${column} >= ${filters.startDate}::date and ${column} < (${filters.endDate}::date + interval '1 day')`
    : sql`${column} < (${filters.endDate}::date + interval '1 day')`;
}

export function dateCondition(column: SQLWrapper, filters: AiStatsFilters) {
  return filters.startDate
    ? sql`${column} >= ${filters.startDate}::date and ${column} <= ${filters.endDate}::date`
    : sql`${column} <= ${filters.endDate}::date`;
}

export function bucketExpression(column: SQLWrapper, grain: AnalyticsResolvedGrain) {
  if (grain === 'month') {
    return sql`date_trunc('month', ${column} at time zone 'Africa/Algiers')::date`;
  }
  if (grain === 'week') {
    return sql`date_trunc('week', ${column} at time zone 'Africa/Algiers')::date`;
  }
  return sql`(${column} at time zone 'Africa/Algiers')::date`;
}

function bucketDate(day: string, grain: AnalyticsResolvedGrain) {
  const date = new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
  if (grain === 'month') {
    date.setUTCDate(1);
  } else if (grain === 'week') {
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (weekday - 1));
  }
  return date.toISOString().slice(0, 10);
}

export function foldShoppingTrend(
  input: Array<Record<string, unknown>>,
  grain: AnalyticsResolvedGrain,
) {
  const buckets = new Map<
    string,
    {
      bucket: string;
      opens: number;
      messages: number;
      resultClicks: number;
      runs: number;
      failed: number;
    }
  >();
  for (const row of input) {
    const key = bucketDate(String(row.day), grain);
    const current = buckets.get(key) ?? {
      bucket: key,
      opens: 0,
      messages: 0,
      resultClicks: 0,
      runs: 0,
      failed: 0,
    };
    current.opens += numberValue(row.opens);
    current.messages += numberValue(row.messages);
    current.resultClicks += numberValue(row.result_clicks);
    current.runs += numberValue(row.runs);
    current.failed += numberValue(row.failed);
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));
}
