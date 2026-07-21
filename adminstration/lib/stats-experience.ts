import { and, eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';

import type { getDb } from '../db/client';
import {
  aiConversations,
  aiProposals,
  aiRuns,
  aiToolCalls,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  landingPages,
  orders,
  products,
} from '../db/schema';

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
  vitals: Array<{ name: string; samples: number; average: number; good: number; needsImprovement: number; poor: number }>;
  errors: Array<{ name: string; count: number; lastSeenAt: string | null }>;
  referrers: Array<{ name: string; sessions: number }>;
  trend: Array<{ bucket: string; sessions: number; pageViews: number; purchases: number; errors: number }>;
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
    opens: number;
    messages: number;
    resultClicks: number;
    errors: number;
    clickThroughRate: number;
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
  if (filters.endDate) conditions.push(sql`${column} < (${filters.endDate}::date + interval '1 day')`);
  return conditions.length ? and(...conditions) : undefined;
}

const ADMIN_REPORTING_TIMEZONE = 'Africa/Algiers';

function reportingTimestampCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate) conditions.push(sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date >= ${filters.startDate}::date`);
  if (filters.endDate) conditions.push(sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date <= ${filters.endDate}::date`);
  return conditions.length ? and(...conditions) : undefined;
}

export function buildLandingPagePerformanceQuery(filters: ExperienceStatsFilters) {
  const storefrontAnalyticsWhere = and(
    dateCondition(analyticsEvents.occurredAt, filters),
    sql`${analyticsEvents.metadata}->>'storefrontProject' = 'storefront-new'`,
  );

  return sql`
    select ${landingPages.id} as id, ${landingPages.slug} as slug,
      ${landingPages.locale} as locale, ${landingPages.status} as status,
      ${products.title} as product, ${landingPages.publishedRevision} as revision,
      count(distinct ${analyticsEvents.sessionId})::int as sessions,
      count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int as product_views,
      count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int as add_to_carts,
      count(*) filter (where ${analyticsEvents.eventName} in ('begin_checkout', 'checkout_submit_attempt'))::int as checkout_starts,
      count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int as purchases,
      coalesce(sum(${analyticsEvents.value}) filter (where ${analyticsEvents.eventName} = 'purchase'), 0)::double precision as revenue
    from ${landingPages}
    join ${products} on ${products.id} = ${landingPages.productId}
    left join ${analyticsEvents} on
      case when ${analyticsEvents.metadata}->>'landingPageId' ~ '^[0-9]+$'
        then (${analyticsEvents.metadata}->>'landingPageId')::bigint end = ${landingPages.id}
      and ${storefrontAnalyticsWhere ?? sql`true`}
    group by ${landingPages.id}, ${landingPages.slug}, ${landingPages.locale},
      ${landingPages.status}, ${products.title}, ${landingPages.publishedRevision}
    order by purchases desc, sessions desc, ${landingPages.updatedAt} desc
    limit 100
  `;
}

export function buildCustomerProductQuery(filters: ExperienceStatsFilters) {
  const orderWhere = and(
    dateCondition(orders.createdAt, filters),
    sql`${orders.archivedAt} is null`,
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
    sql`${orders.archivedAt} is null`,
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
      errors: [],
      referrers: [],
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
        opens: 0,
        messages: 0,
        resultClicks: 0,
        errors: 0,
        clickThroughRate: 0,
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
  return pricing ? round((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000, 6) : null;
}

export function mapLiveAdminAiStats(input: {
  summary?: { runs?: unknown; completed?: unknown; failed?: unknown; inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown; averageDurationMs?: unknown; activeUsers?: unknown };
  tasks: Array<{ name: string; runs: unknown; completed: unknown; tokens: unknown }>;
  models: Array<{ name: string; runs: unknown; tokens: unknown }>;
  trend: Array<{ bucket: string; runs: unknown; completed: unknown; failed: unknown; tokens: unknown }>;
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
  const pricing = getAiUsagePricing('admin');
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
    estimatedCostUsd: estimateCost(inputTokens, outputTokens, pricing),
    costCoverageRate: pricing && runs ? 100 : 0,
    averageDurationMs: round(numberValue(row?.averageDurationMs)),
    toolCalls: numberValue(input.toolCalls),
    proposals: numberValue(input.proposals),
    appliedProposals: numberValue(input.appliedProposals),
    topTasks: input.tasks.map((task) => ({
      name: task.name,
      runs: numberValue(task.runs),
      successRate: numberValue(task.runs) ? round((numberValue(task.completed) / numberValue(task.runs)) * 100) : 0,
      tokens: numberValue(task.tokens),
    })),
    models: input.models.map((model) => ({ name: model.name, runs: numberValue(model.runs), tokens: numberValue(model.tokens) })),
    trend: input.trend.map((point) => ({ bucket: point.bucket, runs: numberValue(point.runs), completed: numberValue(point.completed), failed: numberValue(point.failed), tokens: numberValue(point.tokens) })),
  };
}

export async function getLiveAdminAiStats(db: Database, filters: ExperienceStatsFilters): Promise<AiSurfaceStats> {
  const runWhere = and(eq(aiRuns.surface, 'admin'), reportingTimestampCondition(aiRuns.startedAt, filters));
  const [summaryRows, taskRows, modelRows, trendRows, conversationRows, toolRows, proposalRows] = await Promise.all([
    db.select({
      runs: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
      averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000) filter (where ${aiRuns.completedAt} is not null), 0)::double precision`,
      activeUsers: sql<number>`count(distinct ${aiRuns.actorId})::int`,
    }).from(aiRuns).where(runWhere),
    db.select({ name: aiRuns.task, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(runWhere).groupBy(aiRuns.task).orderBy(sql`2 desc`).limit(10),
    db.select({ name: aiRuns.model, runs: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(runWhere).groupBy(aiRuns.model).orderBy(sql`2 desc`).limit(10),
    db.select({ bucket: sql<string>`to_char(date_trunc('day', ${aiRuns.startedAt} at time zone ${ADMIN_REPORTING_TIMEZONE}), 'YYYY-MM-DD')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`, failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(runWhere).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ count: sql<number>`count(*)::int` }).from(aiConversations).where(and(eq(aiConversations.surface, 'admin'), reportingTimestampCondition(aiConversations.createdAt, filters))),
    db.select({ count: sql<number>`count(*)::int` }).from(aiToolCalls).innerJoin(aiRuns, eq(aiRuns.id, aiToolCalls.runId)).where(and(eq(aiRuns.surface, 'admin'), reportingTimestampCondition(aiToolCalls.startedAt, filters))),
    db.select({ proposals: sql<number>`count(*)::int`, applied: sql<number>`count(*) filter (where ${aiProposals.status} = 'applied')::int` }).from(aiProposals).where(reportingTimestampCondition(aiProposals.createdAt, filters)),
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

export async function getLiveStorefrontAiStats(db: Database, filters: ExperienceStatsFilters): Promise<AiAssistantStats['storefront']> {
  const eventWhere = and(
    reportingTimestampCondition(analyticsEvents.occurredAt, filters),
    sql`${analyticsEvents.metadata}->>'storefrontProject' = 'storefront-new'`,
  );
  const runWhere = and(eventWhere, eq(analyticsEvents.eventName, 'ai_assistant_run'));
  const [summaryRows, taskRows, modelRows, trendRows, eventRows, intentRows] = await Promise.all([
    db.select({
      runs: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'failed')::int`,
      inputTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'inputTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'inputTokens')::int else 0 end), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'outputTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'outputTokens')::int else 0 end), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int`,
      averageDurationMs: sql<number>`coalesce(avg(case when ${analyticsEvents.metadata}->>'durationMs' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'durationMs')::int end), 0)::double precision`,
      activeUsers: sql<number>`count(distinct ${analyticsEvents.journeyId})::int`,
      toolCalls: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'toolCalls' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'toolCalls')::int else 0 end), 0)::int`,
    }).from(analyticsEvents).where(runWhere),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'intent', ''), 'other')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(runWhere).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'model', ''), 'unknown')`, runs: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(runWhere).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({ bucket: sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt} at time zone ${ADMIN_REPORTING_TIMEZONE}), 'YYYY-MM-DD')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`, failed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'failed')::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(runWhere).groupBy(sql`1`).orderBy(sql`1`),
    db.select({
      opens: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_open')::int`,
      messages: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_message')::int`,
      resultClicks: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_result_click')::int`,
      errors: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_error')::int`,
    }).from(analyticsEvents).where(and(eventWhere, inArray(analyticsEvents.eventName, ['ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_error']))),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'intent', ''), 'other')`, messages: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(eventWhere, eq(analyticsEvents.eventName, 'ai_assistant_message'))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
  ]);
  const row = summaryRows[0];
  const runs = numberValue(row?.runs);
  const completed = numberValue(row?.completed);
  const inputTokens = numberValue(row?.inputTokens);
  const outputTokens = numberValue(row?.outputTokens);
  const pricing = getAiUsagePricing('storefront');
  const events = eventRows[0];
  const messages = numberValue(events?.messages);
  const resultClicks = numberValue(events?.resultClicks);
  return {
    runs,
    completed,
    failed: numberValue(row?.failed),
    successRate: runs ? round((completed / runs) * 100) : 0,
    conversations: numberValue(row?.activeUsers),
    activeUsers: numberValue(row?.activeUsers),
    inputTokens,
    outputTokens,
    totalTokens: numberValue(row?.totalTokens),
    estimatedCostUsd: estimateCost(inputTokens, outputTokens, pricing),
    costCoverageRate: pricing && runs ? 100 : 0,
    averageDurationMs: round(numberValue(row?.averageDurationMs)),
    toolCalls: numberValue(row?.toolCalls),
    proposals: 0,
    appliedProposals: 0,
    topTasks: taskRows.map((task) => ({ name: task.name, runs: numberValue(task.runs), successRate: numberValue(task.runs) ? round((numberValue(task.completed) / numberValue(task.runs)) * 100) : 0, tokens: numberValue(task.tokens) })),
    models: modelRows.map((model) => ({ name: model.name, runs: numberValue(model.runs), tokens: numberValue(model.tokens) })),
    trend: trendRows.map((point) => ({ bucket: point.bucket, runs: numberValue(point.runs), completed: numberValue(point.completed), failed: numberValue(point.failed), tokens: numberValue(point.tokens) })),
    opens: numberValue(events?.opens),
    messages,
    resultClicks,
    errors: numberValue(events?.errors),
    clickThroughRate: messages ? round((resultClicks / messages) * 100) : 0,
    topIntents: intentRows.map((intent) => ({ name: intent.name, messages: numberValue(intent.messages) })),
  };
}

function asRows(result: unknown) {
  const candidate = result as { rows?: unknown[] } | undefined;
  return Array.isArray(candidate?.rows) ? candidate.rows as Record<string, unknown>[] : [];
}

export async function getExperienceStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<ExperienceStats> {
  const websiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, filters);
  const newStorefrontAnalyticsWhere = and(
    websiteAnalyticsWhere,
    sql`${analyticsEvents.metadata}->>'storefrontProject' = 'storefront-new'`,
  );
  const websiteRollupWhere = dateCondition(analyticsDailyRollups.day, filters);
  const unrolledWebsiteAnalyticsWhere = and(websiteAnalyticsWhere, sql`not exists (
    select 1 from ${analyticsDailyRollups} rollup
    where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
      and rollup.dimension = 'overall'
      and rollup.dimension_key = ''
  )`);
  const adminRunWhere = and(eq(aiRuns.surface, 'admin'), reportingTimestampCondition(aiRuns.startedAt, filters));
  const paidWhere = dateCondition(analyticsPaidClickVisits.firstSeenAt, filters);
  const paidRollupWhere = dateCondition(analyticsPaidClickDailyRollups.day, filters);
  const unrolledPaidWhere = and(paidWhere, sql`not exists (
    select 1 from ${analyticsPaidClickDailyRollups} rollup
    where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date
  )`);
  const errorNames = ['api_error', 'order_create_failed', 'order_verification_failed_after_create', 'ai_assistant_error'];

  const [
    pageTypeRows,
    localeRows,
    deviceRows,
    vitalRows,
    errorRows,
    referrerRows,
    websiteTrendRows,
    websiteTrendRollupRows,
    engagementResult,
    landingInventoryRows,
    landingPerformanceRows,
    landingBlockRows,
    adminRunRows,
    adminTaskRows,
    adminModelRows,
    adminTrendRows,
    storefrontRunRows,
    storefrontTaskRows,
    storefrontModelRows,
    storefrontTrendRows,
    aiConversationRows,
    aiToolRows,
    aiProposalRows,
    storefrontAssistantRows,
    storefrontIntentRows,
    customerResult,
    customerProductResult,
    paidResult,
    paidRollupRows,
    paidCampaignRows,
  ] = await Promise.all([
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.pageType}, ''), 'unknown')`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      interactions: sql<number>`count(*) filter (where ${analyticsEvents.eventName} not in ('page_view', 'session_start', 'web_vital'))::int`,
    }).from(analyticsEvents).where(websiteAnalyticsWhere).groupBy(sql`1`).orderBy(sql`2 desc`).limit(12),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.locale}, ''), 'unknown')`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      purchases: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
    }).from(analyticsEvents).where(websiteAnalyticsWhere).groupBy(sql`1`).orderBy(sql`2 desc`),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'viewportClass', ''), 'unknown')`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
    }).from(analyticsEvents).where(websiteAnalyticsWhere).groupBy(sql`1`).orderBy(sql`2 desc`),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'metricName', ''), 'unknown')`,
      samples: sql<number>`count(*)::int`,
      average: sql<number>`coalesce(avg(case when (${analyticsEvents.metadata}->>'metricValue') ~ '^-?[0-9]+(\\.[0-9]+)?$' then (${analyticsEvents.metadata}->>'metricValue')::double precision end), 0)`,
      good: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'good')::int`,
      needsImprovement: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'needs-improvement')::int`,
      poor: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'metricRating' = 'poor')::int`,
    }).from(analyticsEvents).where(and(websiteAnalyticsWhere, eq(analyticsEvents.eventName, 'web_vital'))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'failureCode', ''), nullif(${analyticsEvents.metadata}->>'code', ''), nullif(${analyticsEvents.metadata}->>'target', ''), ${analyticsEvents.eventName})`,
      count: sql<number>`count(*)::int`,
      lastSeenAt: sql<Date | null>`max(${analyticsEvents.occurredAt})`,
    }).from(analyticsEvents).where(and(websiteAnalyticsWhere, inArray(analyticsEvents.eventName, errorNames))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsEvents.referrer}, ''), 'Direct')`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
    }).from(analyticsEvents).where(and(websiteAnalyticsWhere, eq(analyticsEvents.eventName, 'page_view'))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({
      bucket: sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt}), 'YYYY-MM-DD')`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
      pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      purchases: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
      errors: sql<number>`count(*) filter (where ${analyticsEvents.eventName} in ('api_error', 'order_create_failed', 'order_verification_failed_after_create'))::int`,
    }).from(analyticsEvents).where(unrolledWebsiteAnalyticsWhere).groupBy(sql`1`).orderBy(sql`1`),
    db.select({
      bucket: analyticsDailyRollups.day,
      sessions: analyticsDailyRollups.sessions,
      pageViews: analyticsDailyRollups.pageViews,
      purchases: analyticsDailyRollups.purchases,
      errors: sql<number>`0::int`,
    }).from(analyticsDailyRollups).where(and(websiteRollupWhere, eq(analyticsDailyRollups.dimension, 'overall'))).orderBy(analyticsDailyRollups.day),
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
        (select count(*)::int from journeys where sessions > 1) as returning_journeys
      from sessions
    `),
    db.select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${landingPages.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${landingPages.status} = 'draft')::int`,
    }).from(landingPages),
    db.execute(buildLandingPagePerformanceQuery(filters)),
    db.execute(sql`
      select coalesce(nullif(metadata->>'landingBlockId', ''), 'page') as name,
        count(*)::int as interactions,
        count(*) filter (where event_name = 'add_to_cart')::int as add_to_carts,
        count(*) filter (where event_name in ('begin_checkout', 'checkout_submit_attempt'))::int as checkouts
      from ${analyticsEvents}
      where ${newStorefrontAnalyticsWhere ?? sql`true`}
        and metadata->>'landingPageId' ~ '^[0-9]+$'
        and event_name not in ('page_view', 'web_vital')
      group by 1 order by 2 desc limit 12
    `),
    db.select({
      runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)::int`, outputTokens: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int`,
      averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000) filter (where ${aiRuns.completedAt} is not null), 0)::double precision`,
      activeUsers: sql<number>`count(distinct ${aiRuns.actorId})::int`,
    }).from(aiRuns).where(adminRunWhere),
    db.select({ name: aiRuns.task, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(adminRunWhere).groupBy(aiRuns.task).orderBy(sql`2 desc`).limit(10),
    db.select({ name: aiRuns.model, runs: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(adminRunWhere).groupBy(aiRuns.model).orderBy(sql`2 desc`).limit(10),
    db.select({ bucket: sql<string>`to_char(date_trunc('day', ${aiRuns.startedAt}), 'YYYY-MM-DD')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${aiRuns.status} = 'completed')::int`, failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`, tokens: sql<number>`coalesce(sum(${aiRuns.totalTokens}), 0)::int` }).from(aiRuns).where(adminRunWhere).groupBy(sql`1`).orderBy(sql`1`),
    db.select({
      runs: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'failed')::int`,
      inputTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'inputTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'inputTokens')::int else 0 end), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'outputTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'outputTokens')::int else 0 end), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int`,
      averageDurationMs: sql<number>`coalesce(avg(case when ${analyticsEvents.metadata}->>'durationMs' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'durationMs')::int end), 0)::double precision`,
      activeUsers: sql<number>`count(distinct ${analyticsEvents.journeyId})::int`,
      toolCalls: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'toolCalls' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'toolCalls')::int else 0 end), 0)::int`,
    }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, eq(analyticsEvents.eventName, 'ai_assistant_run'))),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'intent', ''), 'other')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, eq(analyticsEvents.eventName, 'ai_assistant_run'))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'model', ''), 'unknown')`, runs: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, eq(analyticsEvents.eventName, 'ai_assistant_run'))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
    db.select({ bucket: sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt}), 'YYYY-MM-DD')`, runs: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'completed')::int`, failed: sql<number>`count(*) filter (where ${analyticsEvents.metadata}->>'status' = 'failed')::int`, tokens: sql<number>`coalesce(sum(case when ${analyticsEvents.metadata}->>'totalTokens' ~ '^[0-9]+$' then (${analyticsEvents.metadata}->>'totalTokens')::int else 0 end), 0)::int` }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, eq(analyticsEvents.eventName, 'ai_assistant_run'))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ surface: aiConversations.surface, conversations: sql<number>`count(*)::int` }).from(aiConversations).where(reportingTimestampCondition(aiConversations.createdAt, filters)).groupBy(aiConversations.surface),
    db.select({ surface: aiRuns.surface, count: sql<number>`count(*)::int` }).from(aiToolCalls).innerJoin(aiRuns, eq(aiRuns.id, aiToolCalls.runId)).where(reportingTimestampCondition(aiToolCalls.startedAt, filters)).groupBy(aiRuns.surface),
    db.select({ proposals: sql<number>`count(*)::int`, applied: sql<number>`count(*) filter (where ${aiProposals.status} = 'applied')::int` }).from(aiProposals).where(reportingTimestampCondition(aiProposals.createdAt, filters)),
    db.select({
      opens: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_open')::int`,
      messages: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_message')::int`,
      resultClicks: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_result_click')::int`,
      errors: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'ai_assistant_error')::int`,
    }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, inArray(analyticsEvents.eventName, ['ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click', 'ai_assistant_error']))),
    db.select({ name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'intent', ''), 'other')`, messages: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(newStorefrontAnalyticsWhere, eq(analyticsEvents.eventName, 'ai_assistant_message'))).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
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
    db.select({
      visits: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.visits}), 0)::int`,
      createdOrders: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.createdOrder} + ${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
      purchases: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
      landedOnly: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.landedOnly}), 0)::int`,
    }).from(analyticsPaidClickDailyRollups).where(paidRollupWhere),
    db.select({
      name: sql<string>`coalesce(nullif(${analyticsPaidClickVisits.utmCampaign}, ''), 'Unattributed Meta')`,
      visits: sql<number>`count(*)::int`,
      orders: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.orderId} is not null)::int`,
      purchases: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.purchaseCount} > 0)::int`,
    }).from(analyticsPaidClickVisits).where(unrolledPaidWhere).groupBy(sql`1`).orderBy(sql`2 desc`).limit(10),
  ]);

  const engagement = asRows(engagementResult)[0] ?? {};
  const totalSessions = numberValue(engagement.sessions);
  const engagedSessions = numberValue(engagement.engaged_sessions);
  const errorEvents = numberValue(engagement.errors);
  const websiteTrend = new Map<string, { bucket: string; sessions: number; pageViews: number; purchases: number; errors: number }>();
  for (const row of [...websiteTrendRows, ...websiteTrendRollupRows] as Array<{ bucket: string; sessions: unknown; pageViews: unknown; purchases: unknown; errors: unknown }>) {
    const bucket = String(row.bucket);
    const current = websiteTrend.get(bucket) ?? { bucket, sessions: 0, pageViews: 0, purchases: 0, errors: 0 };
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
  const landingTotals = landingRows.reduce((total, row) => ({
    sessions: total.sessions + row.sessions,
    productViews: total.productViews + row.productViews,
    addToCarts: total.addToCarts + row.addToCarts,
    checkoutStarts: total.checkoutStarts + row.checkoutStarts,
    purchases: total.purchases + row.purchases,
    revenue: total.revenue + row.revenue,
  }), { sessions: 0, productViews: 0, addToCarts: 0, checkoutStarts: 0, purchases: 0, revenue: 0 });

  const conversations = new Map<string, number>((aiConversationRows as Array<{ surface: string; conversations: unknown }>).map((row) => [row.surface, numberValue(row.conversations)]));
  const tools = new Map<string, number>((aiToolRows as Array<{ surface: string; count: unknown }>).map((row) => [row.surface, numberValue(row.count)]));
  const proposals = aiProposalRows[0] ?? { proposals: 0, applied: 0 };

  function mapAiSurface(
    surface: 'admin' | 'storefront',
    summaryRows: Array<{ runs?: unknown; completed?: unknown; failed?: unknown; inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown; averageDurationMs?: unknown; activeUsers?: unknown; toolCalls?: unknown }>,
    taskRows: Array<{ name: string; runs: unknown; completed: unknown; tokens: unknown }>,
    modelRows: Array<{ name: string; runs: unknown; tokens: unknown }>,
    trendRows: Array<{ bucket: string; runs: unknown; completed: unknown; failed: unknown; tokens: unknown }>,
  ): AiSurfaceStats {
    const row = summaryRows[0];
    const runs = numberValue(row?.runs);
    const completed = numberValue(row?.completed);
    const failed = numberValue(row?.failed);
    const inputTokens = numberValue(row?.inputTokens);
    const outputTokens = numberValue(row?.outputTokens);
    const extra = row as unknown as { toolCalls?: number; activeUsers?: number } | undefined;
    const pricing = getAiUsagePricing(surface);
    return {
      runs,
      completed,
      failed,
      successRate: runs ? round((completed / runs) * 100) : 0,
      conversations: conversations.get(surface) ?? (surface === 'storefront' ? numberValue(extra?.activeUsers) : 0),
      activeUsers: numberValue(row?.activeUsers),
      inputTokens,
      outputTokens,
      totalTokens: numberValue(row?.totalTokens),
      estimatedCostUsd: estimateCost(inputTokens, outputTokens, pricing),
      costCoverageRate: pricing && runs ? 100 : 0,
      averageDurationMs: round(numberValue(row?.averageDurationMs)),
      toolCalls: tools.get(surface) ?? (surface === 'storefront' ? numberValue(extra?.toolCalls) : 0),
      proposals: surface === 'admin' ? numberValue(proposals.proposals) : 0,
      appliedProposals: surface === 'admin' ? numberValue(proposals.applied) : 0,
      topTasks: taskRows.map((task) => ({
        name: task.name,
        runs: numberValue(task.runs),
        successRate: numberValue(task.runs) ? round((numberValue(task.completed) / numberValue(task.runs)) * 100) : 0,
        tokens: numberValue(task.tokens),
      })),
      models: modelRows.map((model) => ({ name: model.name, runs: numberValue(model.runs), tokens: numberValue(model.tokens) })),
      trend: trendRows.map((point) => ({ bucket: point.bucket, runs: numberValue(point.runs), completed: numberValue(point.completed), failed: numberValue(point.failed), tokens: numberValue(point.tokens) })),
    };
  }

  const adminAi = mapAiSurface('admin', adminRunRows, adminTaskRows, adminModelRows, adminTrendRows);
  const storefrontAiBase = mapAiSurface('storefront', storefrontRunRows, storefrontTaskRows, storefrontModelRows, storefrontTrendRows);
  const storefrontEvents = storefrontAssistantRows[0] ?? { opens: 0, messages: 0, resultClicks: 0, errors: 0 };
  const storefrontMessages = numberValue(storefrontEvents.messages);

  const customerRows = asRows(customerResult);
  const firstCustomer = customerRows[0] ?? {};
  const productsByPhone = new Map<string, Array<{ name: string; count: number }>>();
  for (const row of asRows(customerProductResult)) {
    const phone = String(row.phone ?? '');
    const items = productsByPhone.get(phone) ?? [];
    if (items.length < 5) items.push({ name: String(row.product ?? ''), count: numberValue(row.count) });
    productsByPhone.set(phone, items);
  }
  const customerCount = numberValue(firstCustomer.customer_count);
  const repeatCustomers = numberValue(firstCustomer.repeat_customers);

  const paid = asRows(paidResult)[0] ?? {};
  const paidRollup = paidRollupRows[0] ?? { visits: 0, createdOrders: 0, purchases: 0, landedOnly: 0 };
  const paidVisits = numberValue(paid.visits) + numberValue(paidRollup.visits);
  const paidCreatedOrders = numberValue(paid.created_orders) + numberValue(paidRollup.createdOrders);
  const paidPurchases = numberValue(paid.purchases) + numberValue(paidRollup.purchases);
  const paidLandedOnly = numberValue(paid.landed_only) + numberValue(paidRollup.landedOnly);

  return {
    website: {
      engagedSessions,
      engagementRate: totalSessions ? round((engagedSessions / totalSessions) * 100) : 0,
      returningJourneys: numberValue(engagement.returning_journeys),
      errorEvents,
      errorRate: totalSessions ? round((errorEvents / totalSessions) * 100) : 0,
      pageTypes: (pageTypeRows as Array<{ name: string; sessions: unknown; pageViews: unknown; interactions: unknown }>).map((row) => ({ name: row.name, sessions: numberValue(row.sessions), pageViews: numberValue(row.pageViews), interactions: numberValue(row.interactions) })),
      locales: (localeRows as Array<{ name: string; sessions: unknown; pageViews: unknown; purchases: unknown }>).map((row) => ({ name: row.name, sessions: numberValue(row.sessions), pageViews: numberValue(row.pageViews), purchases: numberValue(row.purchases) })),
      devices: (deviceRows as Array<{ name: string; sessions: unknown; pageViews: unknown }>).map((row) => ({ name: row.name, sessions: numberValue(row.sessions), pageViews: numberValue(row.pageViews) })),
      vitals: (vitalRows as Array<{ name: string; samples: unknown; average: unknown; good: unknown; needsImprovement: unknown; poor: unknown }>).map((row) => ({ name: row.name, samples: numberValue(row.samples), average: round(numberValue(row.average), row.name === 'CLS' ? 3 : 0), good: numberValue(row.good), needsImprovement: numberValue(row.needsImprovement), poor: numberValue(row.poor) })),
      errors: (errorRows as Array<{ name: string; count: unknown; lastSeenAt: unknown }>).map((row) => ({ name: row.name, count: numberValue(row.count), lastSeenAt: isoValue(row.lastSeenAt) })),
      referrers: (referrerRows as Array<{ name: string; sessions: unknown }>).map((row) => ({ name: row.name, sessions: numberValue(row.sessions) })),
      trend: Array.from(websiteTrend.values()).sort((left, right) => left.bucket.localeCompare(right.bucket)),
    },
    landingPages: {
      summary: {
        total: numberValue(inventory.total),
        published: numberValue(inventory.published),
        drafts: numberValue(inventory.drafts),
        ...landingTotals,
        revenue: round(landingTotals.revenue),
        conversionRate: landingTotals.sessions ? round((landingTotals.purchases / landingTotals.sessions) * 100) : 0,
      },
      pages: landingRows,
      blocks: asRows(landingBlockRows).map((row) => ({ name: String(row.name ?? ''), interactions: numberValue(row.interactions), addToCarts: numberValue(row.add_to_carts), checkouts: numberValue(row.checkouts) })),
    },
    aiAssistants: {
      admin: adminAi,
      storefront: {
        ...storefrontAiBase,
        opens: numberValue(storefrontEvents.opens),
        messages: storefrontMessages,
        resultClicks: numberValue(storefrontEvents.resultClicks),
        errors: numberValue(storefrontEvents.errors),
        clickThroughRate: storefrontMessages ? round((numberValue(storefrontEvents.resultClicks) / storefrontMessages) * 100) : 0,
        topIntents: (storefrontIntentRows as Array<{ name: string; messages: unknown }>).map((row) => ({ name: row.name, messages: numberValue(row.messages) })),
      },
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
      topCampaigns: (paidCampaignRows as Array<{ name: string; visits: unknown; orders: unknown; purchases: unknown }>).map((row) => ({ name: row.name, visits: numberValue(row.visits), orders: numberValue(row.orders), purchases: numberValue(row.purchases) })),
    },
  };
}
