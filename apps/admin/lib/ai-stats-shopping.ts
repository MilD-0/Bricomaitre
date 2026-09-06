import { sql } from 'drizzle-orm';

import {
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
  aiRate,
  dateCondition,
  foldShoppingTrend,
  nullableNumber,
  numberValue,
  rows,
  timestampCondition,
  type AiShoppingStats,
  type AiStatsFilters,
  type Database,
} from './ai-stats-contract';
import { CUSTOMER_SUCCESSFUL_ORDER_STATUSES } from './stats-experience-shared';
import { correctedEcotrackStatusSql } from './ecotrack-status-policy';
import { getAiUsagePricing } from './stats-experience-ai';

export async function loadShopping(
  db: Database,
  filters: AiStatsFilters,
): Promise<AiShoppingStats> {
  const eventWhere = sql`${timestampCondition(analyticsEvents.occurredAt, filters, 'UTC')}
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
        select (${analyticsEvents.occurredAt} at time zone 'UTC')::date as day,
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
            and ${orders.inHouseStatus} in (${sql.join(
              CUSTOMER_SUCCESSFUL_ORDER_STATUSES.map((status) => sql`${status}`),
              sql`, `,
            )})
        )::int as confirmed_assisted,
        count(*) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('payed', 'paye_et_archive')
        )::int as paid_assisted,
        coalesce(sum(${analyticsOrderCohortFacts.automaticPaidProfitDzd}::double precision) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('payed', 'paye_et_archive')
        ), 0)::double precision as paid_contribution_dzd,
        count(*) filter (
          where ${orderAiInfluence.level} in ('engaged', 'recommendation_clicked', 'recommended_product_ordered')
            and ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('payed', 'paye_et_archive')
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
  const contributionOrders = numberValue(order.contribution_orders);
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
        sample: contributionOrders,
      },
      {
        key: 'paidContributionCoverage',
        value: aiRate(contributionOrders, paidAssisted),
        unit: 'percent',
        sample: paidAssisted,
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
      contributionCoveragePct: aiRate(contributionOrders, paidAssisted),
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
