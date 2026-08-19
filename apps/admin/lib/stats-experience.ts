import { and, eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { getAdminAiModelPricing } from './admin-ai-models';
import {
  aiConversations,
  aiProposals,
  aiRuns,
  aiToolCalls,
  analyticsAcquisitionDailyRollups,
  analyticsAiDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  analyticsSessions,
  ecotrackOrderStates,
  landingPages,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  products,
  storefrontSettings,
} from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export const CUSTOMER_SUCCESSFUL_ORDER_STATUSES = [2, 3, 4, 5, 7, 10, 11] as const;

export type ExperienceStatsFilters = {
  startDate: string;
  endDate: string;
};

export type WebsiteExperienceStats = {
  engagedSessions: number;
  engagementRate: number;
  returningJourneys: number;
  errorEvents: number;
  errorRate: number;
  pageTypes: Array<{ name: string; sessions: number; pageViews: number; interactions: number }>;
  locales: Array<{ name: string; sessions: number; pageViews: number; purchases: number }>;
  devices: Array<{ name: string; sessions: number; pageViews: number }>;
  vitals: Array<{
    name: string;
    samples: number;
    average: number;
    good: number;
    needsImprovement: number;
    poor: number;
  }>;
  acquisitionSources: Array<{
    name: string;
    sessions: number;
    orders: number;
    successfulOrders: number;
    conversionRate: number;
  }>;
  acquisitionCoverageStartsAt: string | null;
  trend: Array<{
    bucket: string;
    sessions: number;
    pageViews: number;
    purchases: number;
    errors: number;
  }>;
};

export type LandingPageStats = {
  summary: {
    total: number;
    published: number;
    drafts: number;
    sessions: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
  };
  pages: Array<{
    id: number;
    slug: string;
    locale: string;
    status: string;
    product: string;
    revision: number | null;
    sessions: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
  }>;
  blocks: Array<{ name: string; interactions: number; addToCarts: number; checkouts: number }>;
};

export type AiSurfaceStats = {
  runs: number;
  completed: number;
  failed: number;
  successRate: number;
  conversations: number;
  activeUsers: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  costCoverageRate: number;
  averageDurationMs: number;
  toolCalls: number;
  proposals: number;
  appliedProposals: number;
  topTasks: Array<{ name: string; runs: number; successRate: number; tokens: number }>;
  models: Array<{ name: string; runs: number; tokens: number }>;
  trend: Array<{ bucket: string; runs: number; completed: number; failed: number; tokens: number }>;
};

export type AiAssistantStats = {
  admin: AiSurfaceStats;
  storefront: AiSurfaceStats & {
    enabled: boolean;
    opens: number;
    messages: number;
    resultClicks: number;
    errors: number;
    clickThroughRate: number;
    influencedOrders: number;
    confirmedOrders: number;
    completedOrders: number;
    paidOrders: number;
    recommendedProductOrders: number;
    submittedValueDzd: number;
    confirmationRate: number;
    usageCoverageStartsAt: string | null;
    topIntents: Array<{ name: string; messages: number }>;
  };
};

export type CustomerStats = {
  summary: {
    customers: number;
    successfulOrders: number;
    repeatCustomers: number;
    confirmedCustomers: number;
    repeatRate: number;
    averageOrders: number;
    averageOrderValue: number;
  };
  customers: Array<{
    phone: string;
    name: string;
    city: string;
    orders: number;
    confirmedOrders: number;
    totalValue: number;
    averageOrderValue: number;
    firstOrderAt: string;
    lastOrderAt: string;
    products: Array<{ name: string; count: number }>;
  }>;
};

export type MetaPaidAttributionStats = {
  visits: number;
  createdOrders: number;
  purchases: number;
  landedOnly: number;
  conversionRate: number;
  topCampaigns: Array<{ name: string; visits: number; orders: number; purchases: number }>;
};

export type ExperienceStats = {
  website: WebsiteExperienceStats;
  landingPages: LandingPageStats;
  aiAssistants: AiAssistantStats;
  customers: CustomerStats;
  metaPaidAttribution: MetaPaidAttributionStats;
};

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate) conditions.push(sql`${column} >= ${filters.startDate}::date`);
  if (filters.endDate)
    conditions.push(sql`${column} < (${filters.endDate}::date + interval '1 day')`);
  return conditions.length ? and(...conditions) : undefined;
}

export const ADMIN_REPORTING_TIMEZONE = 'Africa/Algiers';

function reportingTimestampCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate)
    conditions.push(
      sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date >= ${filters.startDate}::date`,
    );
  if (filters.endDate)
    conditions.push(
      sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date <= ${filters.endDate}::date`,
    );
  return conditions.length ? and(...conditions) : undefined;
}

export function buildLandingPagePerformanceQuery(filters: ExperienceStatsFilters) {
  const storefrontAnalyticsWhere = and(
    dateCondition(analyticsEvents.occurredAt, filters),
    sql`${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}`,
  );

  return sql`
    with unique_landing_purchases as (
      select distinct on (landing_page_id, purchase_key)
        landing_page_id, purchase_value
      from (
        select case when ${analyticsEvents.metadata}->>'landingPageId' ~ '^[0-9]+$'
            then (${analyticsEvents.metadata}->>'landingPageId')::bigint end as landing_page_id,
          coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId}) as purchase_key,
          coalesce(${analyticsEvents.value}, 0)::double precision as purchase_value,
          ${analyticsEvents.occurredAt} as occurred_at
        from ${analyticsEvents}
        where ${storefrontAnalyticsWhere ?? sql`true`}
          and ${analyticsEvents.eventName} = 'purchase'
      ) purchases
      where landing_page_id is not null
      order by landing_page_id, purchase_key, occurred_at asc
    ), landing_purchase_totals as (
      select landing_page_id, coalesce(sum(purchase_value), 0)::double precision as revenue
      from unique_landing_purchases
      group by landing_page_id
    )
    select ${landingPages.id} as id, ${landingPages.slug} as slug,
      ${landingPages.locale} as locale, ${landingPages.status} as status,
      ${products.title} as product, ${landingPages.publishedRevision} as revision,
      count(distinct ${analyticsEvents.sessionId})::int as sessions,
      count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int as product_views,
      count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int as add_to_carts,
      count(*) filter (where ${analyticsEvents.eventName} in ('begin_checkout', 'checkout_submit_attempt'))::int as checkout_starts,
      count(distinct coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId}))
        filter (where ${analyticsEvents.eventName} = 'purchase')::int as purchases,
      coalesce(max(landing_purchase_totals.revenue), 0)::double precision as revenue
    from ${landingPages}
    join ${products} on ${products.id} = ${landingPages.productId}
    left join ${analyticsEvents} on
      case when ${analyticsEvents.metadata}->>'landingPageId' ~ '^[0-9]+$'
        then (${analyticsEvents.metadata}->>'landingPageId')::bigint end = ${landingPages.id}
      and ${storefrontAnalyticsWhere ?? sql`true`}
    left join landing_purchase_totals on landing_purchase_totals.landing_page_id = ${landingPages.id}
    group by ${landingPages.id}, ${landingPages.slug}, ${landingPages.locale},
      ${landingPages.status}, ${products.title}, ${landingPages.publishedRevision}
    order by purchases desc, sessions desc, ${landingPages.updatedAt} desc
    limit 100
  `;
}

export function buildCustomerProductQuery(filters: ExperienceStatsFilters) {
  const orderWhere = and(
    dateCondition(orders.createdAt, filters),
    inArray(orders.confirmed, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES]),
  );

  return sql`
    select regexp_replace(${orders.phoneNumber1}, '[^0-9]+', '', 'g') as phone,
      coalesce(${products.title}, product_ref) as product, count(*)::int as count
    from ${orders}
    cross join lateral unnest(${orders.cartProducts}) product_ref
    left join ${products} on ${products.id}::text = product_ref or ${products.mongoId} = product_ref
    where ${orderWhere ?? sql`true`}
    group by 1, 2 order by 1, 3 desc
  `;
}

export function buildCustomerSummaryQuery(filters: ExperienceStatsFilters) {
  const orderWhere = and(
    dateCondition(orders.createdAt, filters),
    inArray(orders.confirmed, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES]),
  );

  return sql`
    with order_values as (
      select regexp_replace(${orders.phoneNumber1}, '[^0-9]+', '', 'g') as phone,
        nullif(trim(concat_ws(' ', ${orders.firstName}, ${orders.lastName})), '') as customer_name,
        ${orders.city} as city, ${orders.confirmed} as confirmed,
        (
          coalesce(${orders.price}::double precision, cart.derived_subtotal, 0)
          + coalesce(${orders.delPr}::double precision, 0)
        ) as value,
        ${orders.createdAt} as created_at
      from ${orders}
      left join lateral (
        select coalesce(sum(matched.unit_price), 0)::double precision as derived_subtotal
        from unnest(${orders.cartProducts}) product_ref
        left join lateral (
          select ${products.price}::double precision as unit_price
          from ${products}
          where (${products.id} = case
              when trim(product_ref) ~ '^[0-9]+$' then trim(product_ref)::bigint
              else null
            end)
            or ${products.mongoId} = trim(product_ref)
            or ${products.slug} = trim(product_ref)
          order by case
            when trim(product_ref) ~ '^[0-9]+$' and ${products.id} = trim(product_ref)::bigint then 0
            when ${products.mongoId} = trim(product_ref) then 1
            else 2
          end
          limit 1
        ) matched on true
      ) cart on true
      where ${orderWhere ?? sql`true`}
    ), ranked as (
      select phone, max(customer_name) as customer_name, max(city) as city,
        count(*)::int as orders,
        count(*)::int as confirmed_orders,
        coalesce(sum(value), 0)::double precision as total_value,
        coalesce(avg(value), 0)::double precision as average_order_value,
        min(created_at) as first_order_at, max(created_at) as last_order_at
      from order_values where phone <> '' group by phone
    )
    select *, count(*) over()::int as customer_count,
      coalesce(sum(orders) over(), 0)::int as successful_orders,
      count(*) filter (where orders > 1) over()::int as repeat_customers,
      count(*) filter (where confirmed_orders > 0) over()::int as confirmed_customers,
      coalesce(avg(orders) over(), 0)::double precision as average_orders,
      coalesce(avg(average_order_value) over(), 0)::double precision as overall_average_order_value
    from ranked order by confirmed_orders desc, orders desc, total_value desc limit 100
  `;
}

function emptyAiSurface(): AiSurfaceStats {
  return {
    runs: 0,
    completed: 0,
    failed: 0,
    successRate: 0,
    conversations: 0,
    activeUsers: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    costCoverageRate: 0,
    averageDurationMs: 0,
    toolCalls: 0,
    proposals: 0,
    appliedProposals: 0,
    topTasks: [],
    models: [],
    trend: [],
  };
}

export function emptyExperienceStats(): ExperienceStats {
  return {
    website: {
      engagedSessions: 0,
      engagementRate: 0,
      returningJourneys: 0,
      errorEvents: 0,
      errorRate: 0,
      pageTypes: [],
      locales: [],
      devices: [],
      vitals: [],
      acquisitionSources: [],
      acquisitionCoverageStartsAt: null,
      trend: [],
    },
    landingPages: {
      summary: {
        total: 0,
        published: 0,
        drafts: 0,
        sessions: 0,
        productViews: 0,
        addToCarts: 0,
        checkoutStarts: 0,
        purchases: 0,
        revenue: 0,
        conversionRate: 0,
      },
      pages: [],
      blocks: [],
    },
    aiAssistants: {
      admin: emptyAiSurface(),
      storefront: {
        ...emptyAiSurface(),
        enabled: false,
        opens: 0,
        messages: 0,
        resultClicks: 0,
        errors: 0,
        clickThroughRate: 0,
        influencedOrders: 0,
        confirmedOrders: 0,
        completedOrders: 0,
        paidOrders: 0,
        recommendedProductOrders: 0,
        submittedValueDzd: 0,
        confirmationRate: 0,
        usageCoverageStartsAt: null,
        topIntents: [],
      },
    },
    customers: {
      summary: {
        customers: 0,
        successfulOrders: 0,
        repeatCustomers: 0,
        confirmedCustomers: 0,
        repeatRate: 0,
        averageOrders: 0,
        averageOrderValue: 0,
      },
      customers: [],
    },
    metaPaidAttribution: {
      visits: 0,
      createdOrders: 0,
      purchases: 0,
      landedOnly: 0,
      conversionRate: 0,
      topCampaigns: [],
    },
  };
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
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
    averageDurationMs?: unknown;
    activeUsers?: unknown;
  };
  tasks: Array<{ name: string; runs: unknown; completed: unknown; tokens: unknown }>;
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
  const inputTokens = numberValue(row?.inputTokens);
  const outputTokens = numberValue(row?.outputTokens);
  const cost = estimateAdminAiModelCost(input.models, runs);
  return {
    runs,
    completed,
    failed: numberValue(row?.failed),
    successRate: runs ? round((completed / runs) * 100) : 0,
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
      successRate: numberValue(task.runs)
        ? round((numberValue(task.completed) / numberValue(task.runs)) * 100)
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
  const [summaryRows, taskRows, modelRows, trendRows, conversationRows, toolRows, proposalRows] =
    await Promise.all([
      db
        .select({
          runs: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
          failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
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
    ]);

  return mapLiveAdminAiStats({
    summary: summaryRows[0],
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
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::bigint else 0 end), 0)::bigint as input_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::bigint else 0 end), 0)::bigint as output_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as total_tokens,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$' then (metadata->>'durationMs')::bigint else 0 end), 0)::bigint as duration_ms_total,
          count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$')::bigint as duration_samples,
          coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'toolCalls' ~ '^[0-9]+$' then (metadata->>'toolCalls')::bigint else 0 end), 0)::bigint as tool_calls
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_error', 'ai_assistant_run')
        union all
        select sum(opens), sum(messages), sum(result_clicks), sum(errors), sum(runs),
          sum(completed), sum(failed), sum(input_tokens), sum(output_tokens), sum(total_tokens),
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
          and event_name in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_error', 'ai_assistant_run')
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
          coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::bigint else 0 end), 0)::bigint as tokens
        from ${analyticsEvents}
        where ${unrolledEventWhere ?? sql`true`}
          and event_name in ('ai_assistant_message', 'ai_assistant_run')
        group by 1
        union all
        select dimension_key, sum(messages), sum(runs), sum(completed), sum(total_tokens)
        from ${analyticsAiDailyRollups}
        where ${rollupWhere ?? sql`true`} and dimension = 'intent'
        group by dimension_key
      )
      select name, sum(messages)::bigint as messages, sum(runs)::bigint as runs,
        sum(completed)::bigint as completed, sum(tokens)::bigint as tokens
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
          and ${analyticsEvents.eventName} in ('ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_error', 'ai_assistant_run')
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
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${inArray(orders.confirmed, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])})::int as confirmed_orders,
        count(*) filter (where ${orderAiInfluence.level} <> 'none' and ${orders.confirmed} in (4, 10))::int as completed_orders,
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
    successRate: runs ? round((completed / runs) * 100) : 0,
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
      successRate: numberValue(task.runs)
        ? round((numberValue(task.completed) / numberValue(task.runs)) * 100)
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

function asRows(result: unknown) {
  const candidate = result as { rows?: unknown[] } | undefined;
  return Array.isArray(candidate?.rows) ? (candidate.rows as Record<string, unknown>[]) : [];
}

export async function getExperienceStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<ExperienceStats> {
  const websiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, filters);
  const storefrontAnalyticsWhere = and(
    websiteAnalyticsWhere,
    sql`${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}`,
  );
  const websiteRollupWhere = dateCondition(analyticsDailyRollups.day, filters);
  const acquisitionSessionWhere = dateCondition(analyticsSessions.startedAt, filters);
  const acquisitionRollupWhere = dateCondition(analyticsAcquisitionDailyRollups.day, filters);
  const unrolledAcquisitionSessionWhere = and(
    acquisitionSessionWhere,
    sql`not exists (
      select 1 from ${analyticsAcquisitionDailyRollups} rollup
      where rollup.day = (${analyticsSessions.startedAt} at time zone 'UTC')::date
        and rollup.channel = ${analyticsSessions.channel}
        and rollup.evidence = ${analyticsSessions.evidence}
    )`,
  );
  const unrolledWebsiteAnalyticsWhere = and(
    websiteAnalyticsWhere,
    sql`not exists (
    select 1 from ${analyticsDailyRollups} rollup
    where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
      and rollup.dimension = 'overall'
      and rollup.dimension_key = ''
  )`,
  );
  const paidWhere = dateCondition(analyticsPaidClickVisits.firstSeenAt, filters);
  const paidRollupWhere = dateCondition(analyticsPaidClickDailyRollups.day, filters);
  const unrolledPaidWhere = and(
    paidWhere,
    sql`not exists (
    select 1 from ${analyticsPaidClickDailyRollups} rollup
    where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date
  )`,
  );
  const [
    pageTypeRows,
    localeRows,
    deviceRows,
    vitalRows,
    acquisitionSessionRows,
    acquisitionRollupRows,
    acquisitionOrderRows,
    acquisitionCoverageResult,
    websiteTrendRows,
    websiteTrendRollupRows,
    engagementResult,
    landingInventoryRows,
    landingPerformanceRows,
    landingBlockRows,
    adminAi,
    storefrontAi,
    customerResult,
    customerProductResult,
    paidResult,
    paidRollupRows,
    paidCampaignRows,
  ] = await Promise.all([
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsEvents.pageType}, ''), 'unknown')`,
        sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        interactions: sql<number>`count(*) filter (where ${analyticsEvents.eventName} not in ('page_view', 'session_start', 'web_vital'))::int`,
      })
      .from(analyticsEvents)
      .where(websiteAnalyticsWhere)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(12),
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsEvents.locale}, ''), 'unknown')`,
        sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        purchases: sql<number>`count(distinct coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId})) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
      })
      .from(analyticsEvents)
      .where(websiteAnalyticsWhere)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'viewportClass', ''), 'unknown')`,
        sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      })
      .from(analyticsEvents)
      .where(websiteAnalyticsWhere)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'metricName', ''), 'unknown')`,
        samples: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(case when (${analyticsEvents.metadata}->>'metricValue') ~ '^-?[0-9]+(\\.[0-9]+)?$' then (${analyticsEvents.metadata}->>'metricValue')::double precision end), 0)`,
        good: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'good')::int`,
        needsImprovement: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'needs-improvement')::int`,
        poor: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'poor')::int`,
      })
      .from(analyticsEvents)
      .where(and(websiteAnalyticsWhere, eq(analyticsEvents.eventName, 'web_vital')))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        name: analyticsSessions.channel,
        sessions: sql<number>`count(*)::int`,
      })
      .from(analyticsSessions)
      .where(unrolledAcquisitionSessionWhere)
      .groupBy(analyticsSessions.channel),
    db
      .select({
        name: analyticsAcquisitionDailyRollups.channel,
        sessions: sql<number>`coalesce(sum(${analyticsAcquisitionDailyRollups.sessions}), 0)::int`,
      })
      .from(analyticsAcquisitionDailyRollups)
      .where(acquisitionRollupWhere)
      .groupBy(analyticsAcquisitionDailyRollups.channel),
    db
      .select({
        name: orderAcquisitionAttribution.channel,
        orders: sql<number>`count(*)::int`,
        successfulOrders: sql<number>`count(*) filter (where ${inArray(orders.confirmed, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])})::int`,
      })
      .from(orderAcquisitionAttribution)
      .innerJoin(orders, eq(orders.id, orderAcquisitionAttribution.orderId))
      .where(reportingTimestampCondition(orders.createdAt, filters))
      .groupBy(orderAcquisitionAttribution.channel),
    db.execute(sql`
      select min(value) as coverage_starts_at from (
        select min(${analyticsSessions.startedAt}) as value from ${analyticsSessions}
        union all
        select min(${analyticsAcquisitionDailyRollups.day}::timestamp at time zone 'UTC')
        from ${analyticsAcquisitionDailyRollups}
      ) coverage
    `),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt}), 'YYYY-MM-DD')`,
        sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        purchases: sql<number>`count(distinct coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId})) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
        errors: sql<number>`count(*) filter (where ${analyticsEvents.eventName} in ('api_error', 'order_create_failed', 'order_verification_failed_after_create'))::int`,
      })
      .from(analyticsEvents)
      .where(unrolledWebsiteAnalyticsWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: analyticsDailyRollups.day,
        sessions: analyticsDailyRollups.sessions,
        pageViews: analyticsDailyRollups.pageViews,
        purchases: analyticsDailyRollups.purchases,
        errors: sql<number>`0::int`,
      })
      .from(analyticsDailyRollups)
      .where(and(websiteRollupWhere, eq(analyticsDailyRollups.dimension, 'overall')))
      .orderBy(analyticsDailyRollups.day),
    db.execute(sql`
      with sessions as (
        select session_id, journey_id,
          count(*) filter (where event_name = 'page_view')::int as page_views,
          count(*) filter (where event_name in ('api_error', 'order_create_failed', 'order_verification_failed_after_create'))::int as errors
        from ${analyticsEvents}
        where ${websiteAnalyticsWhere ?? sql`true`}
        group by session_id, journey_id
      ), journeys as (
        select journey_id, count(*)::int as sessions from sessions group by journey_id
      )
      select count(*)::int as sessions,
        count(*) filter (where page_views > 1)::int as engaged_sessions,
        coalesce(sum(errors), 0)::int as errors,
        count(*) filter (where errors > 0)::int as error_sessions,
        (select count(*)::int from journeys where sessions > 1) as returning_journeys
      from sessions
    `),
    db
      .select({
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${landingPages.status} = 'published')::int`,
        drafts: sql<number>`count(*) filter (where ${landingPages.status} = 'draft')::int`,
      })
      .from(landingPages),
    db.execute(buildLandingPagePerformanceQuery(filters)),
    db.execute(sql`
      select coalesce(nullif(metadata->>'landingBlockId', ''), 'page') as name,
        count(*)::int as interactions,
        count(*) filter (where event_name = 'add_to_cart')::int as add_to_carts,
        count(*) filter (where event_name in ('begin_checkout', 'checkout_submit_attempt'))::int as checkouts
      from ${analyticsEvents}
      where ${storefrontAnalyticsWhere ?? sql`true`}
        and metadata->>'landingPageId' ~ '^[0-9]+$'
        and event_name not in ('page_view', 'web_vital')
      group by 1 order by 2 desc limit 12
    `),
    getLiveAdminAiStats(db, filters),
    getLiveStorefrontAiStats(db, filters),
    db.execute(buildCustomerSummaryQuery(filters)),
    db.execute(buildCustomerProductQuery(filters)),
    db.execute(sql`
      select count(*)::int as visits,
        count(*) filter (where order_id is not null)::int as created_orders,
        count(*) filter (where purchase_count > 0)::int as purchases,
        count(*) filter (where order_id is null and purchase_count = 0 and event_count <= 1)::int as landed_only
      from ${analyticsPaidClickVisits}
      where ${unrolledPaidWhere ?? sql`true`}
    `),
    db
      .select({
        visits: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.visits}), 0)::int`,
        createdOrders: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.createdOrder} + ${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
        purchases: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
        landedOnly: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.landedOnly}), 0)::int`,
      })
      .from(analyticsPaidClickDailyRollups)
      .where(paidRollupWhere),
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsPaidClickVisits.utmCampaign}, ''), 'Unattributed Meta')`,
        visits: sql<number>`count(*)::int`,
        orders: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.orderId} is not null)::int`,
        purchases: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.purchaseCount} > 0)::int`,
      })
      .from(analyticsPaidClickVisits)
      .where(unrolledPaidWhere)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
  ]);

  const engagement = asRows(engagementResult)[0] ?? {};
  const totalSessions = numberValue(engagement.sessions);
  const engagedSessions = numberValue(engagement.engaged_sessions);
  const errorEvents = numberValue(engagement.errors);
  const errorSessions = numberValue(engagement.error_sessions);
  const websiteTrend = new Map<
    string,
    { bucket: string; sessions: number; pageViews: number; purchases: number; errors: number }
  >();
  for (const row of [...websiteTrendRows, ...websiteTrendRollupRows] as Array<{
    bucket: string;
    sessions: unknown;
    pageViews: unknown;
    purchases: unknown;
    errors: unknown;
  }>) {
    const bucket = String(row.bucket);
    const current = websiteTrend.get(bucket) ?? {
      bucket,
      sessions: 0,
      pageViews: 0,
      purchases: 0,
      errors: 0,
    };
    current.sessions += numberValue(row.sessions);
    current.pageViews += numberValue(row.pageViews);
    current.purchases += numberValue(row.purchases);
    current.errors += numberValue(row.errors);
    websiteTrend.set(bucket, current);
  }

  const inventory = landingInventoryRows[0] ?? { total: 0, published: 0, drafts: 0 };
  const landingRows = asRows(landingPerformanceRows).map((row) => {
    const sessions = numberValue(row.sessions);
    const purchases = numberValue(row.purchases);
    return {
      id: numberValue(row.id),
      slug: String(row.slug ?? ''),
      locale: String(row.locale ?? ''),
      status: String(row.status ?? ''),
      product: String(row.product ?? ''),
      revision: row.revision == null ? null : numberValue(row.revision),
      sessions,
      productViews: numberValue(row.product_views),
      addToCarts: numberValue(row.add_to_carts),
      checkoutStarts: numberValue(row.checkout_starts),
      purchases,
      revenue: round(numberValue(row.revenue)),
      conversionRate: sessions ? round((purchases / sessions) * 100) : 0,
    };
  });
  const landingTotals = landingRows.reduce(
    (total, row) => ({
      sessions: total.sessions + row.sessions,
      productViews: total.productViews + row.productViews,
      addToCarts: total.addToCarts + row.addToCarts,
      checkoutStarts: total.checkoutStarts + row.checkoutStarts,
      purchases: total.purchases + row.purchases,
      revenue: total.revenue + row.revenue,
    }),
    { sessions: 0, productViews: 0, addToCarts: 0, checkoutStarts: 0, purchases: 0, revenue: 0 },
  );

  const customerRows = asRows(customerResult);
  const firstCustomer = customerRows[0] ?? {};
  const productsByPhone = new Map<string, Array<{ name: string; count: number }>>();
  for (const row of asRows(customerProductResult)) {
    const phone = String(row.phone ?? '');
    const items = productsByPhone.get(phone) ?? [];
    if (items.length < 5)
      items.push({ name: String(row.product ?? ''), count: numberValue(row.count) });
    productsByPhone.set(phone, items);
  }
  const customerCount = numberValue(firstCustomer.customer_count);
  const repeatCustomers = numberValue(firstCustomer.repeat_customers);

  const paid = asRows(paidResult)[0] ?? {};
  const paidRollup = paidRollupRows[0] ?? {
    visits: 0,
    createdOrders: 0,
    purchases: 0,
    landedOnly: 0,
  };
  const paidVisits = numberValue(paid.visits) + numberValue(paidRollup.visits);
  const paidCreatedOrders =
    numberValue(paid.created_orders) + numberValue(paidRollup.createdOrders);
  const paidPurchases = numberValue(paid.purchases) + numberValue(paidRollup.purchases);
  const paidLandedOnly = numberValue(paid.landed_only) + numberValue(paidRollup.landedOnly);
  const acquisitionSources = new Map<
    string,
    { name: string; sessions: number; orders: number; successfulOrders: number }
  >();
  for (const row of [...acquisitionSessionRows, ...acquisitionRollupRows] as Array<{
    name: string;
    sessions: unknown;
  }>) {
    const current = acquisitionSources.get(row.name) ?? {
      name: row.name,
      sessions: 0,
      orders: 0,
      successfulOrders: 0,
    };
    current.sessions += numberValue(row.sessions);
    acquisitionSources.set(row.name, current);
  }
  for (const row of acquisitionOrderRows as Array<{
    name: string;
    orders: unknown;
    successfulOrders: unknown;
  }>) {
    const current = acquisitionSources.get(row.name) ?? {
      name: row.name,
      sessions: 0,
      orders: 0,
      successfulOrders: 0,
    };
    current.orders += numberValue(row.orders);
    current.successfulOrders += numberValue(row.successfulOrders);
    acquisitionSources.set(row.name, current);
  }

  return {
    website: {
      engagedSessions,
      engagementRate: totalSessions ? round((engagedSessions / totalSessions) * 100) : 0,
      returningJourneys: numberValue(engagement.returning_journeys),
      errorEvents,
      errorRate: totalSessions ? round((errorSessions / totalSessions) * 100) : 0,
      pageTypes: (
        pageTypeRows as Array<{
          name: string;
          sessions: unknown;
          pageViews: unknown;
          interactions: unknown;
        }>
      ).map((row) => ({
        name: row.name,
        sessions: numberValue(row.sessions),
        pageViews: numberValue(row.pageViews),
        interactions: numberValue(row.interactions),
      })),
      locales: (
        localeRows as Array<{
          name: string;
          sessions: unknown;
          pageViews: unknown;
          purchases: unknown;
        }>
      ).map((row) => ({
        name: row.name,
        sessions: numberValue(row.sessions),
        pageViews: numberValue(row.pageViews),
        purchases: numberValue(row.purchases),
      })),
      devices: (deviceRows as Array<{ name: string; sessions: unknown; pageViews: unknown }>).map(
        (row) => ({
          name: row.name,
          sessions: numberValue(row.sessions),
          pageViews: numberValue(row.pageViews),
        }),
      ),
      vitals: (
        vitalRows as Array<{
          name: string;
          samples: unknown;
          average: unknown;
          good: unknown;
          needsImprovement: unknown;
          poor: unknown;
        }>
      ).map((row) => ({
        name: row.name,
        samples: numberValue(row.samples),
        average: round(numberValue(row.average), row.name === 'CLS' ? 3 : 0),
        good: numberValue(row.good),
        needsImprovement: numberValue(row.needsImprovement),
        poor: numberValue(row.poor),
      })),
      acquisitionSources: [...acquisitionSources.values()]
        .map((row) => ({
          ...row,
          conversionRate: row.sessions ? round((row.orders / row.sessions) * 100) : 0,
        }))
        .sort((left, right) => right.sessions - left.sessions || right.orders - left.orders)
        .slice(0, 10),
      acquisitionCoverageStartsAt: isoValue(
        asRows(acquisitionCoverageResult)[0]?.coverage_starts_at,
      ),
      trend: Array.from(websiteTrend.values()).sort((left, right) =>
        left.bucket.localeCompare(right.bucket),
      ),
    },
    landingPages: {
      summary: {
        total: numberValue(inventory.total),
        published: numberValue(inventory.published),
        drafts: numberValue(inventory.drafts),
        ...landingTotals,
        revenue: round(landingTotals.revenue),
        conversionRate: landingTotals.sessions
          ? round((landingTotals.purchases / landingTotals.sessions) * 100)
          : 0,
      },
      pages: landingRows,
      blocks: asRows(landingBlockRows).map((row) => ({
        name: String(row.name ?? ''),
        interactions: numberValue(row.interactions),
        addToCarts: numberValue(row.add_to_carts),
        checkouts: numberValue(row.checkouts),
      })),
    },
    aiAssistants: {
      admin: adminAi,
      storefront: storefrontAi,
    },
    customers: {
      summary: {
        customers: customerCount,
        successfulOrders: numberValue(firstCustomer.successful_orders),
        repeatCustomers,
        confirmedCustomers: numberValue(firstCustomer.confirmed_customers),
        repeatRate: customerCount ? round((repeatCustomers / customerCount) * 100) : 0,
        averageOrders: round(numberValue(firstCustomer.average_orders)),
        averageOrderValue: round(numberValue(firstCustomer.overall_average_order_value)),
      },
      customers: customerRows.map((row) => ({
        phone: String(row.phone ?? ''),
        name: String(row.customer_name ?? '—'),
        city: String(row.city ?? '—'),
        orders: numberValue(row.orders),
        confirmedOrders: numberValue(row.confirmed_orders),
        totalValue: round(numberValue(row.total_value)),
        averageOrderValue: round(numberValue(row.average_order_value)),
        firstOrderAt: isoValue(row.first_order_at) ?? new Date(0).toISOString(),
        lastOrderAt: isoValue(row.last_order_at) ?? new Date(0).toISOString(),
        products: productsByPhone.get(String(row.phone ?? '')) ?? [],
      })),
    },
    metaPaidAttribution: {
      visits: paidVisits,
      createdOrders: paidCreatedOrders,
      purchases: paidPurchases,
      landedOnly: paidLandedOnly,
      conversionRate: paidVisits ? round((paidPurchases / paidVisits) * 100) : 0,
      topCampaigns: (
        paidCampaignRows as Array<{
          name: string;
          visits: unknown;
          orders: unknown;
          purchases: unknown;
        }>
      ).map((row) => ({
        name: row.name,
        visits: numberValue(row.visits),
        orders: numberValue(row.orders),
        purchases: numberValue(row.purchases),
      })),
    },
  };
}
