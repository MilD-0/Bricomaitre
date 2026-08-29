import { and, eq, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  aiConversations,
  aiMessages,
  aiProposals,
  aiRuns,
  aiToolCalls,
  analyticsAiDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  ecotrackOrderStates,
  orderAiInfluence,
  orderLineItems,
  orders,
  storefrontSettings,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { getAdminAiModelPricing } from './admin-ai-models';
import {
  ADMIN_REPORTING_TIMEZONE,
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  dateCondition,
  isoValue,
  numberValue,
  reportingTimestampCondition,
  round,
  type AiAssistantStats,
  type AiSurfaceStats,
  type ExperienceStatsFilters,
} from './stats-experience-shared';

type Database = ReturnType<typeof getDb>;

function asRows(result: unknown) {
  const candidate = result as { rows?: unknown[] } | undefined;
  return Array.isArray(candidate?.rows) ? (candidate.rows as Record<string, unknown>[]) : [];
}

type AiPricing = { input: number; output: number } | null;

export function getAiUsagePricing(
  surface: 'admin' | 'storefront',
  env: Record<string, string | undefined> = process.env,
): AiPricing {
  const prefix = surface === 'admin' ? 'AI_ADMIN' : 'AI_STOREFRONT';
  const rawInput = env[`${prefix}_INPUT_COST_PER_1M_USD`]?.trim();
  const rawOutput = env[`${prefix}_OUTPUT_COST_PER_1M_USD`]?.trim();
  if (!rawInput || !rawOutput) return null;
  const input = Number(rawInput);
  const output = Number(rawOutput);
  return Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output >= 0
    ? { input, output }
    : null;
}

function estimateCost(inputTokens: number, outputTokens: number, pricing: AiPricing) {
  return pricing
    ? round((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000, 6)
    : null;
}

type AiModelUsage = {
  name: string;
  runs: unknown;
  tokens: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
};

export function estimateAdminAiModelCost(
  models: AiModelUsage[],
  totalRuns: number,
  fallbackPricing = getAiUsagePricing('admin'),
) {
  let estimatedCostUsd = 0;
  let coveredRuns = 0;

  for (const model of models) {
    const configured = getAdminAiModelPricing(model.name);
    const pricing = configured
      ? { input: configured.inputPer1MUsd, output: configured.outputPer1MUsd }
      : fallbackPricing;
    if (!pricing) continue;
    estimatedCostUsd +=
      estimateCost(numberValue(model.inputTokens), numberValue(model.outputTokens), pricing) ?? 0;
    coveredRuns += numberValue(model.runs);
  }

  return {
    estimatedCostUsd: coveredRuns > 0 ? round(estimatedCostUsd, 6) : null,
    costCoverageRate: totalRuns ? round((Math.min(coveredRuns, totalRuns) / totalRuns) * 100) : 0,
  };
}

export function mapLiveAdminAiStats(input: {
  summary?: {
    runs?: unknown;
    completed?: unknown;
    failed?: unknown;
    cancelled?: unknown;
    helpful?: unknown;
    notHelpful?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
    averageDurationMs?: unknown;
    activeUsers?: unknown;
  };
  tasks: Array<{
    name: string;
    runs: unknown;
    completed: unknown;
    cancelled?: unknown;
    tokens: unknown;
  }>;
  models: AiModelUsage[];
  trend: Array<{
    bucket: string;
    runs: unknown;
    completed: unknown;
    failed: unknown;
    tokens: unknown;
  }>;
  conversations?: unknown;
  toolCalls?: unknown;
  proposals?: unknown;
  appliedProposals?: unknown;
}): AiSurfaceStats {
  const row = input.summary;
  const runs = numberValue(row?.runs);
  const completed = numberValue(row?.completed);
  const cancelled = numberValue(row?.cancelled);
  const helpful = numberValue(row?.helpful);
  const notHelpful = numberValue(row?.notHelpful);
  const rated = helpful + notHelpful;
  const attempted = runs - cancelled;
  const inputTokens = numberValue(row?.inputTokens);
  const outputTokens = numberValue(row?.outputTokens);
  const cost = estimateAdminAiModelCost(input.models, runs);
  return {
    runs,
    completed,
    failed: numberValue(row?.failed),
    cancelled,
    successRate: attempted ? round((completed / attempted) * 100) : 0,
    helpful,
    notHelpful,
    helpfulRate: rated ? round((helpful / rated) * 100) : 0,
    conversations: numberValue(input.conversations),
    activeUsers: numberValue(row?.activeUsers),
    inputTokens,
    outputTokens,
    totalTokens: numberValue(row?.totalTokens),
    estimatedCostUsd: cost.estimatedCostUsd,
    costCoverageRate: cost.costCoverageRate,
    averageDurationMs: round(numberValue(row?.averageDurationMs)),
    toolCalls: numberValue(input.toolCalls),
    proposals: numberValue(input.proposals),
    appliedProposals: numberValue(input.appliedProposals),
    topTasks: input.tasks.map((task) => ({
      name: task.name,
      runs: numberValue(task.runs),
      successRate:
        numberValue(task.runs) - numberValue(task.cancelled)
          ? round(
              (numberValue(task.completed) /
                (numberValue(task.runs) - numberValue(task.cancelled))) *
                100,
            )
          : 0,
      tokens: numberValue(task.tokens),
    })),
    models: input.models.map((model) => ({
      name: model.name,
      runs: numberValue(model.runs),
      tokens: numberValue(model.tokens),
    })),
    trend: input.trend.map((point) => ({
      bucket: point.bucket,
      runs: numberValue(point.runs),
      completed: numberValue(point.completed),
      failed: numberValue(point.failed),
      tokens: numberValue(point.tokens),
    })),
  };
}

export async function getLiveAdminAiStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<AiSurfaceStats> {
  const runWhere = and(
    eq(aiRuns.surface, 'admin'),
    reportingTimestampCondition(aiRuns.startedAt, filters),
  );
  const [
    summaryRows,
    taskRows,
    modelRows,
    trendRows,
    conversationRows,
    toolRows,
    proposalRows,
    feedbackRows,
  ] = await Promise.all([
    db
      .select({
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
        cancelled: sql<number>`count(*) filter (where ${aiRuns.status} = 'cancelled')::int`,
        inputTokens: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
        averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000) filter (where ${aiRuns.completedAt} is not null), 0)::double precision`,
        activeUsers: sql<number>`count(distinct ${aiRuns.actorId})::int`,
      })
      .from(aiRuns)
      .where(runWhere),
    db
      .select({
        name: aiRuns.task,
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${aiRuns.status} = 'cancelled')::int`,
        tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
      })
      .from(aiRuns)
      .where(runWhere)
      .groupBy(aiRuns.task)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({
        name: aiRuns.model,
        runs: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)::int`,
      })
      .from(aiRuns)
      .where(runWhere)
      .groupBy(aiRuns.model)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${aiRuns.startedAt} at time zone ${ADMIN_REPORTING_TIMEZONE}), 'YYYY-MM-DD')`,
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
        tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
      })
      .from(aiRuns)
      .where(runWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.surface, 'admin'),
          reportingTimestampCondition(aiConversations.createdAt, filters),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiToolCalls)
      .innerJoin(aiRuns, eq(aiRuns.id, aiToolCalls.runId))
      .where(
        and(
          eq(aiRuns.surface, 'admin'),
          reportingTimestampCondition(aiToolCalls.startedAt, filters),
        ),
      ),
    db
      .select({
        proposals: sql<number>`count(*)::int`,
        applied: sql<number>`count(*) filter (where ${aiProposals.status} = 'applied')::int`,
      })
      .from(aiProposals)
      .where(reportingTimestampCondition(aiProposals.createdAt, filters)),
    db
      .select({
        helpful: sql<number>`count(*) filter (where ${aiMessages.content}->>'feedback' = 'helpful')::int`,
        notHelpful: sql<number>`count(*) filter (where ${aiMessages.content}->>'feedback' = 'not_helpful')::int`,
      })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(
        and(
          eq(aiConversations.surface, 'admin'),
          eq(aiMessages.role, 'assistant'),
          reportingTimestampCondition(aiMessages.createdAt, filters),
        ),
      ),
  ]);

  return mapLiveAdminAiStats({
    summary: {
      ...summaryRows[0],
      helpful: feedbackRows[0]?.helpful,
      notHelpful: feedbackRows[0]?.notHelpful,
    },
    tasks: taskRows,
    models: modelRows,
    trend: trendRows,
    conversations: conversationRows[0]?.count,
    toolCalls: toolRows[0]?.count,
    proposals: proposalRows[0]?.proposals,
    appliedProposals: proposalRows[0]?.applied,
  });
}

export async function getLiveStorefrontAiStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<AiAssistantStats['storefront']> {
  const eventWhere = and(
    reportingTimestampCondition(analyticsEvents.occurredAt, filters),
    sql`${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}`,
  );
  const rollupWhere = dateCondition(analyticsAiDailyRollups.day, filters);
  const unrolledEventWhere = and(
    eventWhere,
    sql`not exists (
      select 1 from ${analyticsAiDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        and rollup.dimension = 'overall' and rollup.dimension_key = ''
    )`,
  );
  const [
    summaryResult,
    activeUsersResult,
    taskResult,
    modelResult,
    trendResult,
    settingsRows,
    coverageResult,
    outcomeResult,
  ] = await Promise.all([
    db.execute(sql`
      with totals as (
        select
          count(*) filter (where event_name = 'ai_assistant_open')::bigint as opens,
          count(*) filter (where event_name = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where event_name = 'ai_assistant_result_click')::bigint as result_clicks,
          count(*) filter (where event_name = 'ai_assistant_error')::bigint as errors,
          count(*) filter (where event_name = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::bigint as completed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'failed')::bigint as failed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'cancelled')::bigint as cancelled,
          count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'helpful')::bigint as helpful,
          count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'not_helpful')::bigint as not_helpful,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::bigint else 0 end), 0)::bigint as input_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::bigint else 0 end), 0)::bigint as output_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as total_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$' then (metadata->>'durationMs')::bigint else 0 end), 0)::bigint as duration_ms_total,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$')::bigint as duration_samples,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'toolCalls' ~ '^[0-9]+$' then (metadata->>'toolCalls')::bigint else 0 end), 0)::bigint as tool_calls
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run')
        union all
        select sum(opens), sum(messages), sum(result_clicks), sum(errors), sum(runs),
          sum(completed), sum(failed), sum(cancelled), sum(helpful), sum(not_helpful),
          sum(input_tokens), sum(output_tokens), sum(total_tokens),
          sum(duration_ms_total), sum(duration_samples), sum(tool_calls)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'overall' and dimension_key = ''
      )
      select coalesce(sum(opens), 0)::bigint as opens,
        coalesce(sum(messages), 0)::bigint as messages,
        coalesce(sum(result_clicks), 0)::bigint as result_clicks,
        coalesce(sum(errors), 0)::bigint as errors,
        coalesce(sum(runs), 0)::bigint as runs,
        coalesce(sum(completed), 0)::bigint as completed,
        coalesce(sum(failed), 0)::bigint as failed,
        coalesce(sum(cancelled), 0)::bigint as cancelled,
        coalesce(sum(helpful), 0)::bigint as helpful,
        coalesce(sum(not_helpful), 0)::bigint as not_helpful,
        coalesce(sum(input_tokens), 0)::bigint as input_tokens,
        coalesce(sum(output_tokens), 0)::bigint as output_tokens,
        coalesce(sum(total_tokens), 0)::bigint as total_tokens,
        coalesce(sum(duration_ms_total), 0)::bigint as duration_ms_total,
        coalesce(sum(duration_samples), 0)::bigint as duration_samples,
        coalesce(sum(tool_calls), 0)::bigint as tool_calls
      from totals
    `),
    db.execute(sql`
      select count(distinct member_id)::int as active_users from (
        select journey_id as member_id from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run')
        union
        select member_id from ${analyticsDistinctDailyMembers}
        where ${dateCondition(analyticsDistinctDailyMembers.day, filters) ?? sql`true`}
          and metric = 'ai_journey' and dimension_key = ''
      ) members
    `),
    db.execute(sql`
      with tasks as (
        select coalesce(nullif(metadata->>'intent', ''), 'other') as name,
          count(*) filter (where event_name = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where event_name = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::bigint as completed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'cancelled')::bigint as cancelled,
          coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as tokens
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_message', 'ai_assistant_run')
        group by 1
        union all
        select dimension_key, sum(messages), sum(runs), sum(completed), sum(cancelled), sum(total_tokens)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'intent'
        group by dimension_key
      )
      select name, sum(messages)::bigint as messages, sum(runs)::bigint as runs,
        sum(completed)::bigint as completed, sum(cancelled)::bigint as cancelled,
        sum(tokens)::bigint as tokens
      from tasks group by name order by sum(messages) desc, sum(runs) desc limit 10
    `),
    db.execute(sql`
      with models as (
        select coalesce(nullif(metadata->>'model', ''), 'unknown') as name,
          count(*)::bigint as runs,
          coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as tokens
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`} and event_name = 'ai_assistant_run'
        group by 1
        union all
        select dimension_key, sum(runs), sum(total_tokens)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'model'
        group by dimension_key
      )
      select name, sum(runs)::bigint as runs, sum(tokens)::bigint as tokens
      from models group by name order by sum(runs) desc limit 10
    `),
    db.execute(sql`
      with trend as (
        select to_char(date_trunc('day', occurred_at at time zone ${ADMIN_REPORTING_TIMEZONE}), 'YYYY-MM-DD') as bucket,
          count(*) filter (where event_name = 'ai_assistant_run')::bigint as runs,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::bigint as completed,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'failed')::bigint as failed,
          coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as tokens
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`} and event_name = 'ai_assistant_run'
        group by 1
        union all
        select day::text, runs, completed, failed, total_tokens
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'overall' and dimension_key = ''
      )
      select bucket, sum(runs)::bigint as runs, sum(completed)::bigint as completed,
        sum(failed)::bigint as failed, sum(tokens)::bigint as tokens
      from trend group by bucket order by bucket
    `),
    db.select({ enabled: storefrontSettings.aiAssistantEnabled }).from(storefrontSettings).limit(1),
    db.execute(sql`
      select min(value) as coverage_starts_at from (
        select min(${analyticsEvents.occurredAt}) as value
        from ${analyticsEvents}
        where ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}
          and ${analyticsEvents.eventName} in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run')
        union all
        select min(${analyticsAiDailyRollups.day}::timestamp at time zone 'UTC')
        from ${analyticsAiDailyRollups}
        where ${analyticsAiDailyRollups.dimension} = 'overall'
          and ${analyticsAiDailyRollups.dimensionKey} = ''
      ) coverage
    `),
    db.execute(sql`
      with line_values as (
        select ${orderLineItems.orderId} as order_id,
          coalesce(sum(${orderLineItems.lineTotal}), 0)::double precision as submitted_value
        from ${orderLineItems}
        group by ${orderLineItems.orderId}
      )
      select count(*) filter (where ${orderAiInfluence.level} <> 'none')::int as influenced_orders,
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${inArray(orders.inHouseStatus, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])})::int as confirmed_orders,
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${inArray(orders.inHouseStatus, [ORDER_STATUS.COMPLETED, ORDER_STATUS.MANUAL_COMPLETED])})::int as completed_orders,
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${ecotrackOrderStates.currentStatus} = 'paye_et_archive')::int as paid_orders,
        count(*) filter (where ${orderAiInfluence.recommendedProductOrdered})::int as recommended_product_orders,
        coalesce(sum(coalesce(line_values.submitted_value, ${orders.price}::double precision, 0))
          filter (where ${orderAiInfluence.level} <> 'none'), 0)::double precision as submitted_value_dzd
      from ${orderAiInfluence}
      inner join ${orders} on ${orders.id} = ${orderAiInfluence.orderId}
      left join line_values on line_values.order_id = ${orders.id}
      left join ${ecotrackOrderStates} on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      where ${reportingTimestampCondition(orders.createdAt, filters) ?? sql`true`}
    `),
  ]);
  const row = asRows(summaryResult)[0] ?? {};
  const runs = numberValue(row.runs);
  const completed = numberValue(row.completed);
  const cancelled = numberValue(row.cancelled);
  const helpful = numberValue(row.helpful);
  const notHelpful = numberValue(row.not_helpful);
  const rated = helpful + notHelpful;
  const attempted = runs - cancelled;
  const inputTokens = numberValue(row.input_tokens);
  const outputTokens = numberValue(row.output_tokens);
  const durationSamples = numberValue(row.duration_samples);
  const taskRows = asRows(taskResult);
  const modelRows = asRows(modelResult);
  const trendRows = asRows(trendResult);
  const activeUsers = numberValue(asRows(activeUsersResult)[0]?.active_users);
  const outcomes = asRows(outcomeResult)[0] ?? {};
  const coverageStartsAt = asRows(coverageResult)[0]?.coverage_starts_at;
  const influencedOrders = numberValue(outcomes.influenced_orders);
  const confirmedOrders = numberValue(outcomes.confirmed_orders);
  const pricing = getAiUsagePricing('storefront');
  const messages = numberValue(row.messages);
  const resultClicks = numberValue(row.result_clicks);
  return {
    enabled: settingsRows[0]?.enabled ?? true,
    runs,
    completed,
    failed: numberValue(row.failed),
    cancelled,
    successRate: attempted ? round((completed / attempted) * 100) : 0,
    helpful,
    notHelpful,
    helpfulRate: rated ? round((helpful / rated) * 100) : 0,
    conversations: activeUsers,
    activeUsers,
    inputTokens,
    outputTokens,
    totalTokens: numberValue(row.total_tokens),
    estimatedCostUsd: estimateCost(inputTokens, outputTokens, pricing),
    costCoverageRate: pricing && runs ? 100 : 0,
    averageDurationMs: durationSamples
      ? round(numberValue(row.duration_ms_total) / durationSamples)
      : 0,
    toolCalls: numberValue(row.tool_calls),
    proposals: 0,
    appliedProposals: 0,
    topTasks: taskRows.map((task) => ({
      name: String(task.name ?? 'other'),
      runs: numberValue(task.runs),
      successRate:
        numberValue(task.runs) - numberValue(task.cancelled)
          ? round(
              (numberValue(task.completed) /
                (numberValue(task.runs) - numberValue(task.cancelled))) *
                100,
            )
          : 0,
      tokens: numberValue(task.tokens),
    })),
    models: modelRows.map((model) => ({
      name: String(model.name ?? 'unknown'),
      runs: numberValue(model.runs),
      tokens: numberValue(model.tokens),
    })),
    trend: trendRows.map((point) => ({
      bucket: String(point.bucket),
      runs: numberValue(point.runs),
      completed: numberValue(point.completed),
      failed: numberValue(point.failed),
      tokens: numberValue(point.tokens),
    })),
    opens: numberValue(row.opens),
    messages,
    resultClicks,
    errors: numberValue(row.errors),
    clickThroughRate: messages ? round((resultClicks / messages) * 100) : 0,
    influencedOrders,
    confirmedOrders,
    completedOrders: numberValue(outcomes.completed_orders),
    paidOrders: numberValue(outcomes.paid_orders),
    recommendedProductOrders: numberValue(outcomes.recommended_product_orders),
    submittedValueDzd: round(numberValue(outcomes.submitted_value_dzd)),
    confirmationRate: influencedOrders ? round((confirmedOrders / influencedOrders) * 100) : 0,
    usageCoverageStartsAt: isoValue(coverageStartsAt),
    topIntents: taskRows.map((intent) => ({
      name: String(intent.name ?? 'other'),
      messages: numberValue(intent.messages),
    })),
  };
}
