import { and, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsAiDailyRollups,
  analyticsEvents,
  ecotrackOrderStates,
  orderAiInfluence,
  orders,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { getAdminAiModelPricing } from './admin-ai-models';
import {
  ANALYTICS_PAID_SHIPMENT_STATUSES,
  correctedEcotrackStatusSql,
} from './ecotrack-status-policy';
import {
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  dateCondition,
  timestampCondition,
  numberValue,
  reportingTimestampCondition,
  round,
  type ExperienceStatsFilters,
  type StorefrontAiStats,
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

export async function getLiveStorefrontAiStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<StorefrontAiStats> {
  const eventWhere = and(
    timestampCondition(analyticsEvents.occurredAt, filters),
    sql`${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}`,
  );
  const rollupWhere = dateCondition(analyticsAiDailyRollups.day, filters);
  const unrolledEventWhere = and(
    eventWhere,
    sql`not exists (
      select 1 from ${analyticsAiDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone rollup.day_timezone)::date
        and rollup.dimension = 'overall' and rollup.dimension_key = ''
    )`,
  );
  const [summaryResult, outcomeResult] = await Promise.all([
    db.execute(sql`
      with totals as (
        select
          count(*) filter (where event_name = 'ai_assistant_open')::bigint as opens,
          count(*) filter (where event_name = 'ai_assistant_message')::bigint as messages,
          count(*) filter (where event_name = 'ai_assistant_result_click')::bigint as result_clicks
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click')
        union all
        select sum(opens), sum(messages), sum(result_clicks)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'overall' and dimension_key = ''
      )
      select coalesce(sum(opens), 0)::bigint as opens,
        coalesce(sum(messages), 0)::bigint as messages,
        coalesce(sum(result_clicks), 0)::bigint as result_clicks
      from totals
    `),
    db.execute(sql`
      select count(*) filter (where ${orderAiInfluence.level} <> 'none')::int as influenced_orders,
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${inArray(orders.inHouseStatus, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])})::int as confirmed_orders,
        count(*) filter (
          where ${orderAiInfluence.level} <> 'none'
            and ${inArray(correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus }), [...ANALYTICS_PAID_SHIPMENT_STATUSES])}
        )::int as paid_orders
      from ${orderAiInfluence}
      inner join ${orders} on ${orders.id} = ${orderAiInfluence.orderId}
      left join ${ecotrackOrderStates} on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      where ${reportingTimestampCondition(orders.createdAt, filters) ?? sql`true`}
    `),
  ]);
  const row = asRows(summaryResult)[0] ?? {};
  const outcomes = asRows(outcomeResult)[0] ?? {};
  return {
    opens: numberValue(row.opens),
    messages: numberValue(row.messages),
    resultClicks: numberValue(row.result_clicks),
    influencedOrders: numberValue(outcomes.influenced_orders),
    confirmedOrders: numberValue(outcomes.confirmed_orders),
    paidOrders: numberValue(outcomes.paid_orders),
  };
}
