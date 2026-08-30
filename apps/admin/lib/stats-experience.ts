import { and, eq, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import {
  analyticsAcquisitionDailyRollups,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  analyticsSessions,
  landingPages,
  orderAcquisitionAttribution,
  orders,
  products,
} from '@bric/db/schema';
import { getLiveAdminAiStats, getLiveStorefrontAiStats } from './stats-experience-ai';
import {
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  dateCondition,
  emptyExperienceStats,
  inclusiveDateDays,
  isoValue,
  numberValue,
  reportingTimestampCondition,
  resolveRawWebsiteFilters,
  round,
  type ExperienceStats,
  type ExperienceStatsFilters,
} from './stats-experience-shared';

export {
  estimateAdminAiModelCost,
  getAiUsagePricing,
  getLiveAdminAiStats,
  getLiveStorefrontAiStats,
  mapLiveAdminAiStats,
} from './stats-experience-ai';
export {
  ADMIN_REPORTING_TIMEZONE,
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  emptyExperienceStats,
  resolveRawWebsiteFilters,
} from './stats-experience-shared';
export type {
  AiAssistantStats,
  CustomerStats,
  ExperienceStats,
  ExperienceStatsFilters,
  LandingPageStats,
  MetaPaidAttributionStats,
  WebsiteExperienceStats,
} from './stats-experience-shared';

type Database = ReturnType<typeof getDb>;

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
    inArray(orders.inHouseStatus, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES]),
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
    inArray(orders.inHouseStatus, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES]),
  );

  return sql`
    with order_values as (
      select regexp_replace(${orders.phoneNumber1}, '[^0-9]+', '', 'g') as phone,
        nullif(trim(concat_ws(' ', ${orders.firstName}, ${orders.lastName})), '') as customer_name,
        ${orders.city} as city, ${orders.inHouseStatus} as confirmed,
        (
          coalesce(${orders.price}::double precision, cart.derived_subtotal, 0)
          + coalesce(${orders.deliveryFee}::double precision, 0)
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

function asRows(result: unknown) {
  const candidate = result as { rows?: unknown[] } | undefined;
  return Array.isArray(candidate?.rows) ? (candidate.rows as Record<string, unknown>[]) : [];
}

export async function getExperienceStats(
  db: Database,
  filters: ExperienceStatsFilters,
  options: { scope?: 'all' | 'storefront' } = {},
): Promise<ExperienceStats> {
  const includeExtendedSurfaces = options.scope !== 'storefront';
  const includeRawSessionStats = includeExtendedSurfaces || inclusiveDateDays(filters) <= 7;
  const empty = emptyExperienceStats();
  const websiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, filters);
  const rawWebsiteFilters = resolveRawWebsiteFilters(filters);
  const rawWebsiteAnalyticsWhere = dateCondition(analyticsEvents.occurredAt, rawWebsiteFilters);
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
    includeExtendedSurfaces ? websiteAnalyticsWhere : rawWebsiteAnalyticsWhere,
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
    includeExtendedSurfaces
      ? db
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
          .limit(12)
      : Promise.resolve([]),
    includeExtendedSurfaces
      ? db
          .select({
            name: sql<string>`coalesce(nullif(${analyticsEvents.locale}, ''), 'unknown')`,
            sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
            pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
            purchases: sql<number>`count(distinct coalesce(${analyticsEvents.orderId}::text, ${analyticsEvents.eventId})) filter (where ${analyticsEvents.eventName} = 'purchase')::int`,
          })
          .from(analyticsEvents)
          .where(websiteAnalyticsWhere)
          .groupBy(sql`1`)
          .orderBy(sql`2 desc`)
      : Promise.resolve([]),
    includeExtendedSurfaces
      ? db
          .select({
            name: sql<string>`coalesce(nullif(${analyticsEvents.metadata}->>'viewportClass', ''), 'unknown')`,
            sessions: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
            pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
          })
          .from(analyticsEvents)
          .where(websiteAnalyticsWhere)
          .groupBy(sql`1`)
          .orderBy(sql`2 desc`)
      : Promise.resolve([]),
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
    includeExtendedSurfaces
      ? db.execute(sql`
      select coalesce(nullif(metadata->>'landingBlockId', ''), 'page') as name,
        count(*)::int as interactions,
        count(*) filter (where event_name = 'add_to_cart')::int as add_to_carts,
        count(*) filter (where event_name in ('begin_checkout', 'checkout_submit_attempt'))::int as checkouts
      from ${analyticsEvents}
      where ${storefrontAnalyticsWhere ?? sql`true`}
        and metadata->>'landingPageId' ~ '^[0-9]+$'
        and event_name not in ('page_view', 'web_vital')
      group by 1 order by 2 desc limit 12
    `)
      : Promise.resolve({ rows: [] }),
    includeExtendedSurfaces
      ? getLiveAdminAiStats(db, filters)
      : Promise.resolve(empty.aiAssistants.admin),
    getLiveStorefrontAiStats(db, filters),
    includeExtendedSurfaces
      ? db.execute(buildCustomerSummaryQuery(filters))
      : Promise.resolve({ rows: [] }),
    includeExtendedSurfaces
      ? db.execute(buildCustomerProductQuery(filters))
      : Promise.resolve({ rows: [] }),
    includeExtendedSurfaces
      ? db.execute(sql`
      select count(*)::int as visits,
        count(*) filter (where order_id is not null)::int as created_orders,
        count(*) filter (where purchase_count > 0)::int as purchases,
        count(*) filter (where order_id is null and purchase_count = 0 and event_count <= 1)::int as landed_only
      from ${analyticsPaidClickVisits}
      where ${unrolledPaidWhere ?? sql`true`}
    `)
      : Promise.resolve({ rows: [] }),
    includeExtendedSurfaces
      ? db
          .select({
            visits: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.visits}), 0)::int`,
            createdOrders: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.createdOrder} + ${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
            purchases: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
            landedOnly: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.landedOnly}), 0)::int`,
          })
          .from(analyticsPaidClickDailyRollups)
          .where(paidRollupWhere)
      : Promise.resolve([]),
    includeExtendedSurfaces
      ? db
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
          .limit(10)
      : Promise.resolve([]),
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
