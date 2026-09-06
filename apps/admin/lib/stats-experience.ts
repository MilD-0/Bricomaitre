import { and, eq, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsAcquisitionDailyRollups,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsSessions,
  landingPages,
  orderAcquisitionAttribution,
  orders,
  products,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { getLiveStorefrontAiStats } from './stats-experience-ai';
import {
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  dateCondition,
  inclusiveDateDays,
  isoValue,
  numberValue,
  reportingTimestampCondition,
  resolveRawWebsiteFilters,
  round,
  type ExperienceStats,
  type ExperienceStatsFilters,
} from './stats-experience-shared';

type Database = ReturnType<typeof getDb>;

function buildLandingPagePerformanceQuery(filters: ExperienceStatsFilters) {
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

function asRows(result: unknown) {
  const candidate = result as { rows?: unknown[] } | undefined;
  return Array.isArray(candidate?.rows) ? (candidate.rows as Record<string, unknown>[]) : [];
}

export async function getStorefrontExperienceStats(
  db: Database,
  filters: ExperienceStatsFilters,
): Promise<ExperienceStats> {
  const includeRawSessionStats = inclusiveDateDays(filters) <= 7;
  const websiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, filters);
  const rawWebsiteFilters = resolveRawWebsiteFilters(filters);
  const rawWebsiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, rawWebsiteFilters);
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
    rawWebsiteAnalyticsWhere,
    sql`not exists (
    select 1 from ${analyticsDailyRollups} rollup
    where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
      and rollup.dimension = 'overall'
      and rollup.dimension_key = ''
  )`,
  );
  const [
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
    storefrontAi,
  ] = await Promise.all([
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'metricName', ''), 'unknown')`,
        samples: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(case when (${analyticsEvents.metadata}->>'metricValue') ~ '^-?[0-9]+(\\.[0-9]+)?$' then (${analyticsEvents.metadata}->>'metricValue')::double precision end), 0)`,
        p75: sql<number>`coalesce(percentile_cont(0.75) within group (order by case when (${analyticsEvents.metadata}->>'metricValue') ~ '^-?[0-9]+(\\.[0-9]+)?$' then (${analyticsEvents.metadata}->>'metricValue')::double precision end), 0)::double precision`,
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
        successfulOrders: sql<number>`count(*) filter (where ${inArray(orders.inHouseStatus, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])})::int`,
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
    includeRawSessionStats
      ? db.execute(sql`
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
    `)
      : Promise.resolve({ rows: [] }),
    db
      .select({
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${landingPages.status} = 'published')::int`,
        drafts: sql<number>`count(*) filter (where ${landingPages.status} = 'draft')::int`,
      })
      .from(landingPages),
    db.execute(buildLandingPagePerformanceQuery(filters)),
    getLiveStorefrontAiStats(db, filters),
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
      vitals: (
        vitalRows as Array<{
          name: string;
          samples: unknown;
          average: unknown;
          p75: unknown;
          good: unknown;
          needsImprovement: unknown;
          poor: unknown;
        }>
      ).map((row) => ({
        name: row.name,
        samples: numberValue(row.samples),
        average: round(numberValue(row.average), row.name === 'CLS' ? 3 : 0),
        p75: round(numberValue(row.p75), row.name === 'CLS' ? 3 : 0),
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
    },
    aiAssistants: {
      storefront: storefrontAi,
    },
  };
}
