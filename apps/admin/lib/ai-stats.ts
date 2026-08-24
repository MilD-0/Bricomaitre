import { sql, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  aiConversations,
  aiMessages,
  aiProposals,
  aiRuns,
  aiToolCalls,
  analyticsAiDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsOrderCohortFacts,
  ecotrackOrderStates,
  orderAiInfluence,
  orders,
  storefrontSettings,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';

import {
  resolveAnalytics2Filters,
  resolveAnalytics2ReferenceNow,
  type Analytics2Grain,
  type Analytics2Range,
  type Analytics2ResolvedGrain,
} from './analytics2';
import {
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  estimateAdminAiModelCost,
  getAiUsagePricing,
} from './stats-experience';

type Database = ReturnType<typeof getDb>;

const aiStatsSurfaces = ['operations', 'shopping'] as const;
export type AiStatsSurface = (typeof aiStatsSurfaces)[number];
export type AiStatsRange = Analytics2Range;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

type AiStatsFilters = {
  surface: AiStatsSurface;
  range: Analytics2Range;
  startDate: string | null;
  endDate: string;
  grain: Analytics2Grain;
  resolvedGrain: Analytics2ResolvedGrain;
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

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rows(result: Awaited<ReturnType<Database['execute']>>) {
  return result.rows as Array<Record<string, unknown>>;
}

function timestampCondition(column: SQLWrapper, filters: AiStatsFilters) {
  return filters.startDate
    ? sql`${column} >= ${filters.startDate}::date and ${column} < (${filters.endDate}::date + interval '1 day')`
    : sql`${column} < (${filters.endDate}::date + interval '1 day')`;
}

function dateCondition(column: SQLWrapper, filters: AiStatsFilters) {
  return filters.startDate
    ? sql`${column} >= ${filters.startDate}::date and ${column} <= ${filters.endDate}::date`
    : sql`${column} <= ${filters.endDate}::date`;
}

function bucketExpression(column: SQLWrapper, grain: Analytics2ResolvedGrain) {
  if (grain === 'month') {
    return sql`date_trunc('month', ${column} at time zone 'Africa/Algiers')::date`;
  }
  if (grain === 'week') {
    return sql`date_trunc('week', ${column} at time zone 'Africa/Algiers')::date`;
  }
  return sql`(${column} at time zone 'Africa/Algiers')::date`;
}

function bucketDate(day: string, grain: Analytics2ResolvedGrain) {
  const date = new Date(`${day.slice(0, 10)}T00:00:00.000Z`);
  if (grain === 'month') {
    date.setUTCDate(1);
  } else if (grain === 'week') {
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (weekday - 1));
  }
  return date.toISOString().slice(0, 10);
}

function foldShoppingTrend(input: Array<Record<string, unknown>>, grain: Analytics2ResolvedGrain) {
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

async function loadAiDatasetCutoff(db: Database, surface: AiStatsSurface) {
  const result =
    surface === 'operations'
      ? await db.execute(sql`
          select to_char(max(${aiRuns.startedAt} at time zone 'Africa/Algiers'), 'YYYY-MM-DD') as cutoff
          from ${aiRuns} where ${aiRuns.surface} = 'admin'
        `)
      : await db.execute(sql`
          select to_char(greatest(
            (select max(${analyticsAiDailyRollups.day}) from ${analyticsAiDailyRollups}),
            (select max(${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')
              from ${analyticsEvents}
              where ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}),
            (select max(${orderAiInfluence.capturedAt} at time zone 'Africa/Algiers')
              from ${orderAiInfluence})
          ), 'YYYY-MM-DD') as cutoff
        `);
  const value = rows(result)[0]?.cutoff;
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
}

function resolveAiFilters(query: AiStatsQuery, now: Date): AiStatsFilters {
  const parsed = aiStatsQuerySchema.parse(query);
  const shared = resolveAnalytics2Filters(
    {
      view: 'command',
      range: parsed.range,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      grain: parsed.grain,
    },
    now,
  );
  return {
    surface: parsed.surface,
    range: shared.range,
    startDate: shared.startDate,
    endDate: shared.endDate,
    grain: shared.grain,
    resolvedGrain: shared.resolvedGrain,
  };
}

async function loadOperations(db: Database, filters: AiStatsFilters): Promise<AiOperationsStats> {
  const runWhere = timestampCondition(aiRuns.startedAt, filters);
  const bucket = bucketExpression(aiRuns.startedAt, filters.resolvedGrain);
  const [
    summaryResult,
    feedbackResult,
    trendResult,
    workflowResult,
    workflowCostResult,
    toolsResult,
    releasesResult,
    changesResult,
    exceptionsResult,
  ] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        count(*) filter (where ${aiRuns.status} = 'running')::int as running,
        count(distinct ${aiRuns.actorId}) filter (where ${aiRuns.actorId} is not null)::int
          as active_operators,
        coalesce(sum(${aiRuns.inputTokens}), 0)::bigint as input_tokens,
        coalesce(sum(${aiRuns.outputTokens}), 0)::bigint as output_tokens,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as total_tokens,
        count(*) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt})::int
          as valid_duration_samples,
        percentile_cont(0.5) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p50_duration_ms,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
    `),
    db.execute(sql`
      select
        count(*)::int as assistant_answers,
        count(*) filter (where ${aiMessages.content}->>'feedback' in ('helpful', 'not_helpful'))::int
          as rated_answers,
        count(*) filter (where ${aiMessages.content}->>'feedback' = 'helpful')::int
          as helpful_answers
      from ${aiMessages}
      inner join ${aiConversations} on ${aiConversations.id} = ${aiMessages.conversationId}
      where ${aiConversations.surface} = 'admin' and ${aiMessages.role} = 'assistant'
        and ${timestampCondition(aiMessages.createdAt, filters)}
    `),
    db.execute(sql`
      select to_char(${bucket}, 'YYYY-MM-DD') as bucket,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
      group by 1 order by 1
    `),
    db.execute(sql`
      select ${aiRuns.task} as task,
        min(${aiRuns.model}) as representative_model,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
      group by ${aiRuns.task}
      order by count(*) desc, ${aiRuns.task} asc
      limit 20
    `),
    db.execute(sql`
      select ${aiRuns.task} as task, ${aiRuns.model} as model,
        count(*)::int as runs,
        coalesce(sum(${aiRuns.inputTokens}), 0)::bigint as input_tokens,
        coalesce(sum(${aiRuns.outputTokens}), 0)::bigint as output_tokens,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
      group by ${aiRuns.task}, ${aiRuns.model}
    `),
    db.execute(sql`
      select ${aiToolCalls.toolName} as name,
        count(*)::int as calls,
        count(*) filter (where ${aiToolCalls.status} = 'completed')::int as completed,
        count(*) filter (where ${aiToolCalls.status} <> 'completed')::int as failed,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiToolCalls.completedAt} - ${aiToolCalls.startedAt})) * 1000
        ) filter (where ${aiToolCalls.completedAt} >= ${aiToolCalls.startedAt}) as p95_duration_ms
      from ${aiToolCalls}
      inner join ${aiRuns} on ${aiRuns.id} = ${aiToolCalls.runId}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat'
        and ${timestampCondition(aiToolCalls.startedAt, filters)}
      group by ${aiToolCalls.toolName}
      order by count(*) desc, ${aiToolCalls.toolName} asc
      limit 16
    `),
    db.execute(sql`
      select ${aiRuns.promptVersion} as prompt_version, ${aiRuns.model} as model,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.inputTokens}), 0)::bigint as input_tokens,
        coalesce(sum(${aiRuns.outputTokens}), 0)::bigint as output_tokens,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
      group by ${aiRuns.promptVersion}, ${aiRuns.model}
      order by max(${aiRuns.startedAt}) desc
      limit 12
    `),
    db.execute(sql`
      select ${aiProposals.proposalType} as type, ${aiProposals.status} as status,
        count(*)::int as count
      from ${aiProposals}
      inner join ${aiRuns} on ${aiRuns.id} = ${aiProposals.runId}
      where ${aiRuns.surface} = 'admin' and ${timestampCondition(aiProposals.createdAt, filters)}
      group by ${aiProposals.proposalType}, ${aiProposals.status}
      order by count(*) desc, ${aiProposals.proposalType}, ${aiProposals.status}
      limit 16
    `),
    db.execute(sql`
      select ${aiRuns.id}, ${aiRuns.startedAt}, ${aiRuns.task}, ${aiRuns.model},
        ${aiRuns.promptVersion}, ${aiRuns.status}, ${aiRuns.errorCode}
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
        and ${aiRuns.status} in ('failed', 'cancelled')
      order by ${aiRuns.startedAt} desc
      limit 20
    `),
  ]);

  const summary = rows(summaryResult)[0] ?? {};
  const feedback = rows(feedbackResult)[0] ?? {};
  const interactiveRuns = numberValue(summary.runs);
  const completed = numberValue(summary.completed);
  const failed = numberValue(summary.failed);
  const cancelled = numberValue(summary.cancelled);
  const terminalAttempted = completed + failed;
  const modelUsage = rows(workflowCostResult)
    .filter((row) => String(row.task) === 'admin_chat')
    .map((row) => ({
      name: String(row.model),
      runs: numberValue(row.runs),
      tokens: numberValue(row.tokens),
      inputTokens: numberValue(row.input_tokens),
      outputTokens: numberValue(row.output_tokens),
    }));
  const interactiveCost = estimateAdminAiModelCost(modelUsage, interactiveRuns);
  const workflowCosts = new Map<string, { cost: number; coveredRuns: number; runs: number }>();
  for (const row of rows(workflowCostResult)) {
    const task = String(row.task);
    const runs = numberValue(row.runs);
    const estimate = estimateAdminAiModelCost(
      [
        {
          name: String(row.model),
          runs,
          tokens: numberValue(row.tokens),
          inputTokens: numberValue(row.input_tokens),
          outputTokens: numberValue(row.output_tokens),
        },
      ],
      runs,
    );
    const current = workflowCosts.get(task) ?? { cost: 0, coveredRuns: 0, runs: 0 };
    current.runs += runs;
    if (estimate.estimatedCostUsd != null) {
      current.cost += estimate.estimatedCostUsd;
      current.coveredRuns += runs;
    }
    workflowCosts.set(task, current);
  }
  const toolRows = rows(toolsResult);
  const toolCalls = toolRows.reduce((sum, row) => sum + numberValue(row.calls), 0);
  const completedToolCalls = toolRows.reduce((sum, row) => sum + numberValue(row.completed), 0);
  const ratedAnswers = numberValue(feedback.rated_answers);
  const helpfulAnswers = numberValue(feedback.helpful_answers);
  const p95DurationMs = nullableNumber(summary.p95_duration_ms);

  return {
    kind: 'operations',
    metrics: [
      { key: 'interactiveRequests', value: interactiveRuns, unit: 'number' },
      {
        key: 'responseCompletion',
        value: aiRate(completed, terminalAttempted),
        unit: 'percent',
        sample: terminalAttempted,
      },
      {
        key: 'toolCompletion',
        value: aiRate(completedToolCalls, toolCalls),
        unit: 'percent',
        sample: toolCalls,
      },
      {
        key: 'p95Latency',
        value: p95DurationMs,
        unit: 'milliseconds',
        sample: numberValue(summary.valid_duration_samples),
      },
      {
        key: 'helpfulRatings',
        value: aiRate(helpfulAnswers, ratedAnswers),
        unit: 'percent',
        sample: ratedAnswers,
      },
      {
        key: 'costPerCompletion',
        value:
          interactiveCost.estimatedCostUsd != null && completed > 0
            ? interactiveCost.estimatedCostUsd / completed
            : null,
        unit: 'usd',
        sample: completed,
      },
    ],
    summary: {
      interactiveRuns,
      completed,
      failed,
      cancelled,
      running: numberValue(summary.running),
      activeOperators: numberValue(summary.active_operators),
      validDurationSamples: numberValue(summary.valid_duration_samples),
      totalTokens: numberValue(summary.total_tokens),
      estimatedCostUsd: interactiveCost.estimatedCostUsd,
      costCoveragePct: interactiveRuns ? interactiveCost.costCoverageRate : null,
      assistantAnswers: numberValue(feedback.assistant_answers),
      ratedAnswers,
      helpfulAnswers,
      toolCalls,
      completedToolCalls,
    },
    trend: rows(trendResult).map((row) => ({
      bucket: String(row.bucket),
      runs: numberValue(row.runs),
      completed: numberValue(row.completed),
      failed: numberValue(row.failed),
      cancelled: numberValue(row.cancelled),
      tokens: numberValue(row.tokens),
    })),
    workflows: rows(workflowResult).map((row) => {
      const runs = numberValue(row.runs);
      const completed = numberValue(row.completed);
      const failed = numberValue(row.failed);
      const cost = workflowCosts.get(String(row.task));
      return {
        task: String(row.task),
        mode: classifyAiWorkload(String(row.task), String(row.representative_model)),
        runs,
        completed,
        failed,
        cancelled: numberValue(row.cancelled),
        completionPct: aiRate(completed, completed + failed),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
        tokens: numberValue(row.tokens),
        estimatedCostUsd: cost && cost.coveredRuns === cost.runs ? cost.cost : null,
      };
    }),
    tools: toolRows.map((row) => {
      const calls = numberValue(row.calls);
      const completed = numberValue(row.completed);
      return {
        name: String(row.name),
        calls,
        completed,
        failed: numberValue(row.failed),
        completionPct: aiRate(completed, calls),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
      };
    }),
    releases: rows(releasesResult).map((row) => {
      const runs = numberValue(row.runs);
      const completed = numberValue(row.completed);
      const failed = numberValue(row.failed);
      const estimate = estimateAdminAiModelCost(
        [
          {
            name: String(row.model),
            runs,
            tokens: numberValue(row.tokens),
            inputTokens: numberValue(row.input_tokens),
            outputTokens: numberValue(row.output_tokens),
          },
        ],
        runs,
      );
      return {
        promptVersion: String(row.prompt_version),
        model: String(row.model),
        runs,
        completed,
        failed,
        cancelled: numberValue(row.cancelled),
        completionPct: aiRate(completed, completed + failed),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
        tokens: numberValue(row.tokens),
        estimatedCostUsd: estimate.estimatedCostUsd,
      };
    }),
    changes: rows(changesResult).map((row) => ({
      type: String(row.type),
      status: String(row.status),
      count: numberValue(row.count),
    })),
    exceptions: rows(exceptionsResult).map((row) => ({
      id: numberValue(row.id),
      startedAt: isoValue(row.started_at) ?? '',
      task: String(row.task),
      model: String(row.model),
      promptVersion: String(row.prompt_version),
      status: String(row.status),
      errorCode: row.error_code == null ? null : String(row.error_code),
    })),
  };
}

async function loadShopping(db: Database, filters: AiStatsFilters): Promise<AiShoppingStats> {
  const eventWhere = sql`${timestampCondition(analyticsEvents.occurredAt, filters)}
    and ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}`;
  const rollupWhere = dateCondition(analyticsAiDailyRollups.day, filters);
  const unrolledEventWhere = sql`${eventWhere} and not exists (
    select 1 from ${analyticsAiDailyRollups} rollup
    where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
      and rollup.dimension = 'overall' and rollup.dimension_key = ''
  )`;
  const [summaryResult, activeResult, trendResult, intentResult, orderResult, settingsResult] =
    await Promise.all([
      db.execute(sql`
      with totals as (
        select
          count(*) filter (where event_name = 'ai_assistant_open')::bigint as opens,
          count(*) filter (where event_name = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where event_name = 'ai_assistant_result_click')::bigint as result_clicks,
          count(*) filter (where event_name = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::bigint as completed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'failed')::bigint as failed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'cancelled')::bigint as cancelled,
          count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'helpful')::bigint as helpful,
          count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'not_helpful')::bigint as not_helpful,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::bigint else 0 end), 0)::bigint as input_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::bigint else 0 end), 0)::bigint as output_tokens
        from ${analyticsEvents}
        where ${unrolledEventWhere}
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_feedback', 'ai_assistant_run')
        union all
        select sum(opens), sum(messages), sum(result_clicks), sum(runs), sum(completed),
          sum(failed), sum(cancelled), sum(helpful), sum(not_helpful), sum(input_tokens),
          sum(output_tokens)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere} and dimension = 'overall' and dimension_key = ''
      )
      select coalesce(sum(opens), 0)::bigint as opens,
        coalesce(sum(messages), 0)::bigint as messages,
        coalesce(sum(result_clicks), 0)::bigint as result_clicks,
        coalesce(sum(runs), 0)::bigint as runs,
        coalesce(sum(completed), 0)::bigint as completed,
        coalesce(sum(failed), 0)::bigint as failed,
        coalesce(sum(cancelled), 0)::bigint as cancelled,
        coalesce(sum(helpful), 0)::bigint as helpful,
        coalesce(sum(not_helpful), 0)::bigint as not_helpful,
        coalesce(sum(input_tokens), 0)::bigint as input_tokens,
        coalesce(sum(output_tokens), 0)::bigint as output_tokens
      from totals
    `),
      db.execute(sql`
      select count(distinct member_id)::int as active_journeys from (
        select ${analyticsEvents.journeyId} as member_id from ${analyticsEvents}
        where ${unrolledEventWhere}
          and ${analyticsEvents.eventName} in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click')
        union
        select ${analyticsDistinctDailyMembers.memberId} from ${analyticsDistinctDailyMembers}
        where ${dateCondition(analyticsDistinctDailyMembers.day, filters)}
          and ${analyticsDistinctDailyMembers.metric} = 'ai_journey'
          and ${analyticsDistinctDailyMembers.dimensionKey} = ''
      ) members
    `),
      db.execute(sql`
      with trend as (
        select (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date as day,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_open')::bigint as opens,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_result_click')::bigint as result_clicks,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_run' and ${analyticsEvents.metadata}->>'status' = 'failed')::bigint as failed
        from ${analyticsEvents}
        where ${unrolledEventWhere}
        group by 1
        union all
        select ${analyticsAiDailyRollups.day}, ${analyticsAiDailyRollups.opens},
          ${analyticsAiDailyRollups.messages}, ${analyticsAiDailyRollups.resultClicks},
          ${analyticsAiDailyRollups.runs}, ${analyticsAiDailyRollups.failed}
        from ${analyticsAiDailyRollups}
        where ${rollupWhere} and ${analyticsAiDailyRollups.dimension} = 'overall'
          and ${analyticsAiDailyRollups.dimensionKey} = ''
      )
      select day::text, sum(opens)::bigint as opens, sum(messages)::bigint as messages,
        sum(result_clicks)::bigint as result_clicks, sum(runs)::bigint as runs,
        sum(failed)::bigint as failed
      from trend group by day order by day
    `),
      db.execute(sql`
      with intents as (
        select coalesce(nullif(${analyticsEvents.metadata}->>'intent', ''), 'other') as name,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_run' and ${analyticsEvents.metadata}->>'status' = 'completed')::bigint as completed,
          count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_result_click')::bigint as result_clicks
        from ${analyticsEvents}
        where ${unrolledEventWhere}
          and ${analyticsEvents.eventName} in ('ai_assistant_message', 'ai_assistant_run', 'ai_assistant_result_click')
        group by 1
        union all
        select ${analyticsAiDailyRollups.dimensionKey}, sum(${analyticsAiDailyRollups.messages}),
          sum(${analyticsAiDailyRollups.runs}), sum(${analyticsAiDailyRollups.completed}),
          sum(${analyticsAiDailyRollups.resultClicks})
        from ${analyticsAiDailyRollups}
        where ${rollupWhere} and ${analyticsAiDailyRollups.dimension} = 'intent'
        group by ${analyticsAiDailyRollups.dimensionKey}
      )
      select name, sum(messages)::bigint as messages, sum(runs)::bigint as runs,
        sum(completed)::bigint as completed, sum(result_clicks)::bigint as result_clicks
      from intents group by name order by sum(messages) desc, sum(runs) desc limit 12
    `),
      db.execute(sql`
      select
        count(*) filter (where ${orderAiInfluence.level} <> 'none')::int as exposed,
        count(*) filter (where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered'))::int as engaged,
        count(*) filter (where ${orderAiInfluence.level} in ('recommendation_clicked', 'recommended_product_ordered'))::int as recommendation_clicked,
        count(*) filter (where ${orderAiInfluence.recommendedProductOrdered})::int as recommended_product_ordered,
        count(*) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${orders.confirmed} in (${sql.join(
              CUSTOMER_SUCCESSFUL_ORDER_STATUSES.map((status) => sql`${status}`),
              sql`, `,
            )})
        )::int as confirmed_assisted,
        count(*) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${ecotrackOrderStates.currentStatus} in ('payed', 'paye_et_archive')
        )::int as paid_assisted,
        coalesce(sum(${analyticsOrderCohortFacts.automaticPaidProfitDzd}::double precision) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${ecotrackOrderStates.currentStatus} in ('payed', 'paye_et_archive')
        ), 0)::double precision as paid_contribution_dzd,
        count(*) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${ecotrackOrderStates.currentStatus} in ('payed', 'paye_et_archive')
            and ${analyticsOrderCohortFacts.automaticPaidProfitDzd} is not null
        )::int as contribution_orders
      from ${orderAiInfluence}
      inner join ${orders} on ${orders.id} = ${orderAiInfluence.orderId}
      left join ${ecotrackOrderStates} on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join ${analyticsOrderCohortFacts}
        on ${analyticsOrderCohortFacts.orderId} = ${orders.id}
      where ${timestampCondition(orders.createdAt, filters)}
    `),
      db.execute(sql`
      select ${storefrontSettings.aiAssistantEnabled} as enabled
      from ${storefrontSettings}
      limit 1
    `),
    ]);

  const summary = rows(summaryResult)[0] ?? {};
  const order = rows(orderResult)[0] ?? {};
  const runs = numberValue(summary.runs);
  const completed = numberValue(summary.completed);
  const failed = numberValue(summary.failed);
  const ratedAnswers = numberValue(summary.helpful) + numberValue(summary.not_helpful);
  const paidAssisted = numberValue(order.paid_assisted);
  const storefrontPricing = getAiUsagePricing('storefront');
  const estimatedCostUsd = storefrontPricing
    ? (numberValue(summary.input_tokens) * storefrontPricing.input +
        numberValue(summary.output_tokens) * storefrontPricing.output) /
      1_000_000
    : null;
  const rawLatencyResult = await db.execute(sql`
    select count(*)::int as samples,
      percentile_cont(0.95) within group (
        order by (${analyticsEvents.metadata}->>'durationMs')::double precision
      ) as p95_duration_ms
    from ${analyticsEvents}
    where ${eventWhere} and ${analyticsEvents.eventName} = 'ai_assistant_run'
      and ${analyticsEvents.metadata}->>'durationMs' ~ '^[0-9]+(\\.[0-9]+)?$'
  `);
  const latency = rows(rawLatencyResult)[0] ?? {};

  return {
    kind: 'shopping',
    enabled: rows(settingsResult)[0]?.enabled !== false,
    metrics: [
      { key: 'engagedJourneys', value: numberValue(summary.messages), unit: 'number' },
      {
        key: 'resultClickRate',
        value: aiRate(numberValue(summary.result_clicks), numberValue(summary.messages)),
        unit: 'percent',
        sample: numberValue(summary.messages),
      },
      {
        key: 'recommendedOrders',
        value: numberValue(order.recommended_product_ordered),
        unit: 'number',
      },
      { key: 'confirmedAssisted', value: numberValue(order.confirmed_assisted), unit: 'number' },
      { key: 'paidAssisted', value: paidAssisted, unit: 'number' },
      {
        key: 'paidContribution',
        value: numberValue(order.paid_contribution_dzd),
        unit: 'dzd',
        sample: numberValue(order.contribution_orders),
      },
    ],
    summary: {
      opens: numberValue(summary.opens),
      messages: numberValue(summary.messages),
      resultClicks: numberValue(summary.result_clicks),
      runs,
      completed,
      failed,
      cancelled: numberValue(summary.cancelled),
      activeJourneys: numberValue(rows(activeResult)[0]?.active_journeys),
      ratedAnswers,
      helpfulAnswers: numberValue(summary.helpful),
      p95DurationMs: nullableNumber(latency.p95_duration_ms),
      durationSamples: numberValue(latency.samples),
      estimatedCostUsd,
    },
    journey: [
      { key: 'opened', value: numberValue(summary.opens) },
      { key: 'messaged', value: numberValue(summary.messages) },
      { key: 'resultClicked', value: numberValue(summary.result_clicks) },
      { key: 'engagedOrder', value: numberValue(order.engaged) },
      { key: 'recommendedOrder', value: numberValue(order.recommended_product_ordered) },
      { key: 'confirmed', value: numberValue(order.confirmed_assisted) },
      { key: 'paid', value: paidAssisted },
    ],
    orders: {
      exposed: numberValue(order.exposed),
      engaged: numberValue(order.engaged),
      recommendationClicked: numberValue(order.recommendation_clicked),
      recommendedProductOrdered: numberValue(order.recommended_product_ordered),
      confirmedAssisted: numberValue(order.confirmed_assisted),
      paidAssisted,
      paidContributionDzd: numberValue(order.paid_contribution_dzd),
      contributionCoveragePct: aiRate(numberValue(order.contribution_orders), paidAssisted),
    },
    trend: foldShoppingTrend(rows(trendResult), filters.resolvedGrain),
    intents: rows(intentResult).map((row) => {
      const runs = numberValue(row.runs);
      const completed = numberValue(row.completed);
      return {
        name: String(row.name),
        messages: numberValue(row.messages),
        runs,
        completed,
        resultClicks: numberValue(row.result_clicks),
        completionPct: aiRate(completed, runs),
      };
    }),
  };
}

export async function getAiStatsData(
  query: AiStatsQuery,
  options: { db?: Database; now?: Date } = {},
): Promise<AiStatsPayload> {
  const startedAt = performance.now();
  const db = options.db ?? getDb();
  const parsed = aiStatsQuerySchema.parse(query);
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoff = reviewSetting ? await loadAiDatasetCutoff(db, parsed.surface) : null;
  const clock = resolveAnalytics2ReferenceNow(reviewSetting, cutoff, wallNow);
  const filters = resolveAiFilters(
    clock.reviewClock && parsed.range === 'custom' && parsed.endDate! > clock.referenceDate
      ? { ...parsed, endDate: clock.referenceDate }
      : parsed,
    clock.now,
  );
  const [data, coverageResult] = await Promise.all([
    filters.surface === 'operations' ? loadOperations(db, filters) : loadShopping(db, filters),
    filters.surface === 'operations'
      ? db.execute(sql`
          select min(${aiRuns.startedAt}) as from_at, max(${aiRuns.startedAt}) as through_at,
            count(*)::int as records
          from ${aiRuns} where ${aiRuns.surface} = 'admin' and ${timestampCondition(aiRuns.startedAt, filters)}
        `)
      : db.execute(sql`
          select min(${analyticsEvents.occurredAt}) as from_at,
            max(${analyticsEvents.occurredAt}) as through_at, count(*)::int as records
          from ${analyticsEvents}
          where ${timestampCondition(analyticsEvents.occurredAt, filters)}
            and ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}
            and ${analyticsEvents.eventName} like 'ai_assistant_%'
        `),
  ]);
  const coverage = rows(coverageResult)[0] ?? {};
  const base = {
    surface: filters.surface,
    filters,
    generatedAt: clock.now.toISOString(),
    referenceDate: clock.referenceDate,
    reviewClock: clock.reviewClock,
    coverage: {
      fromDate: isoValue(coverage.from_at)?.slice(0, 10) ?? null,
      throughDate: isoValue(coverage.through_at)?.slice(0, 10) ?? null,
      records: numberValue(coverage.records),
    },
    data,
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  } satisfies AiStatsPayload;
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
