import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  metaEventDailyRollups,
  metaEventOutbox,
  metaWorkerHeartbeat,
  orderMetaAttribution,
  orderStatusHistory,
  orders,
  processedOrders,
} from '@bric/db/schema';
import { ORDER_STATUS } from './orders';
import type { MetaPaidAttributionStats } from './stats-experience';
import { numberOrZero, round } from './stats-values';
import type { StatsFilters } from './stats-contract';
import {
  buildAnalyticsRollupWhere,
  buildAnalyticsWhere,
  buildCanonicalStorefrontSessionsQuery,
  buildWebsiteProductMetricsQuery,
} from './stats-live-commerce';

export const statsDateExpression = sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`;
const analyticsResultsCountExpression = sql<number>`case
  when coalesce(${analyticsEvents.metadata}->>'resultsCount', '') ~ '^-?[0-9]+$'
    then (${analyticsEvents.metadata}->>'resultsCount')::int
  else -1
end`;
type WebsiteSummaryRow = {
  sessions: number;
  journeys: number;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutStarts: number;
  searches: number;
  zeroResultSearches: number;
};

type WebsiteSearchRow = {
  term: string;
  searches: number;
  zeroResults: number;
};

type WebsiteTopProductRow = {
  id: number;
  title: string;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

export type WebsiteMetricRow = {
  id: number;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

type MetaTrackedEventSummaryRow = {
  name: string;
  total: number;
  pixelFired: number;
  capiSent: number;
  capiDelivered: number;
  capiFailed: number;
  lastOccurredAt: Date | string | null;
};

type MetaTrackedEventLogRow = {
  eventId: string;
  analyticsEventName: string;
  metaEventName: string;
  pagePath: string | null;
  occurredAt: Date | string;
  pixelPayload: Record<string, unknown>;
  capiPayload: Record<string, unknown>;
  capiStatus: number | null;
  capiOk: boolean;
};

export function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getWebsiteAnalyticsData(
  db: ReturnType<typeof getDb>,
  analyticsWhere: ReturnType<typeof buildAnalyticsWhere>,
  rollupWhere: ReturnType<typeof buildAnalyticsRollupWhere>,
  filters: Required<StatsFilters>,
  includeProductMetrics = true,
  identityMode: 'rollup-members' | 'sessions' | 'daily-rollups' = 'rollup-members',
) {
  const unrolledAnalyticsWhere = and(
    analyticsWhere,
    sql`not exists (
      select 1 from ${analyticsDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        and rollup.dimension = 'overall'
        and rollup.dimension_key = ''
    )`,
  );
  const [
    websiteSummaryRows,
    websiteSearchRows,
    websiteProductResult,
    rollupSummaryRows,
    rollupSearchRows,
    exactIdentityResult,
  ] = await Promise.all([
    db
      .select({
        sessions: sql<number>`count(distinct case when ${analyticsEvents.eventName} = 'page_view' then ${analyticsEvents.sessionId} end)::int`,
        journeys: sql<number>`count(distinct ${analyticsEvents.journeyId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
        productViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int`,
        addToCarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int`,
        checkoutStarts: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int`,
        searches: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search')::int`,
        zeroResultSearches: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search' and ${analyticsResultsCountExpression} = 0)::int`,
      })
      .from(analyticsEvents)
      .where(unrolledAnalyticsWhere),
    db
      .select({
        term: sql<string>`trim(${analyticsEvents.searchTerm})`,
        searches: sql<number>`count(*)::int`,
        zeroResults: sql<number>`count(*) filter (where ${analyticsResultsCountExpression} = 0)::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          unrolledAnalyticsWhere,
          eq(analyticsEvents.eventName, 'search'),
          sql`coalesce(trim(${analyticsEvents.searchTerm}), '') <> ''`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(8),
    includeProductMetrics
      ? db.execute(buildWebsiteProductMetricsQuery(filters))
      : Promise.resolve({ rows: [] }),
    db
      .select({
        sessions: sql<number>`coalesce(sum(${analyticsDailyRollups.sessions}), 0)::int`,
        journeys: sql<number>`coalesce(sum(${analyticsDailyRollups.journeys}), 0)::int`,
        pageViews: sql<number>`coalesce(sum(${analyticsDailyRollups.pageViews}), 0)::int`,
        productViews: sql<number>`coalesce(sum(${analyticsDailyRollups.productViews}), 0)::int`,
        addToCarts: sql<number>`coalesce(sum(${analyticsDailyRollups.addToCarts}), 0)::int`,
        checkoutStarts: sql<number>`coalesce(sum(${analyticsDailyRollups.checkoutStarts}), 0)::int`,
        searches: sql<number>`coalesce(sum(${analyticsDailyRollups.searches}), 0)::int`,
        zeroResultSearches: sql<number>`coalesce(sum(${analyticsDailyRollups.zeroResultSearches}), 0)::int`,
      })
      .from(analyticsDailyRollups)
      .where(and(rollupWhere, eq(analyticsDailyRollups.dimension, 'overall'))),
    db
      .select({
        term: analyticsDailyRollups.dimensionKey,
        searches: sql<number>`sum(${analyticsDailyRollups.searches})::int`,
        zeroResults: sql<number>`sum(${analyticsDailyRollups.zeroResultSearches})::int`,
      })
      .from(analyticsDailyRollups)
      .where(
        and(
          rollupWhere,
          eq(analyticsDailyRollups.dimension, 'search'),
          sql`coalesce(trim(${analyticsDailyRollups.dimensionKey}), '') not in ('', 'Unknown')`,
        ),
      )
      .groupBy(analyticsDailyRollups.dimensionKey),
    identityMode === 'daily-rollups'
      ? Promise.resolve({ rows: [] })
      : identityMode === 'sessions'
        ? db.execute(buildCanonicalStorefrontSessionsQuery(filters))
        : db.execute(sql`
          select metric, dimension_key, count(distinct member_id)::int as members
          from (
            select metric, dimension_key, member_id
            from ${analyticsDistinctDailyMembers}
            where ${filters.startDate ? sql`${analyticsDistinctDailyMembers.day} >= ${filters.startDate}::date` : sql`true`}
              and ${filters.endDate ? sql`${analyticsDistinctDailyMembers.day} <= ${filters.endDate}::date` : sql`true`}
            union all
            select 'journey', '', ${analyticsEvents.journeyId}
            from ${analyticsEvents}
            where ${unrolledAnalyticsWhere ?? sql`true`}
            union all
            select 'session', '', ${analyticsEvents.sessionId}
            from ${analyticsEvents}
            where ${unrolledAnalyticsWhere ?? sql`true`} and ${analyticsEvents.eventName} = 'page_view'
          ) identities
          group by metric, dimension_key
        `),
  ]);

  const rawSummary = websiteSummaryRows[0] as WebsiteSummaryRow | undefined;
  const rollupSummary = rollupSummaryRows[0] as WebsiteSummaryRow | undefined;
  const summaryKeys = [
    'sessions',
    'journeys',
    'pageViews',
    'productViews',
    'addToCarts',
    'checkoutStarts',
    'searches',
    'zeroResultSearches',
  ] as const;
  const mergedSummary = Object.fromEntries(
    summaryKeys.map((key) => [
      key,
      numberOrZero(rawSummary?.[key]) + numberOrZero(rollupSummary?.[key]),
    ]),
  ) as WebsiteSummaryRow;
  if (identityMode === 'sessions') {
    const identity = exactIdentityResult.rows[0] as Record<string, unknown> | undefined;
    mergedSummary.sessions = numberOrZero(identity?.sessions);
  } else if (identityMode === 'rollup-members') {
    const exactIdentityRows = exactIdentityResult.rows as Array<{
      metric: string;
      dimension_key: string;
      members: number | string;
    }>;
    mergedSummary.sessions = numberOrZero(
      exactIdentityRows.find((row) => row.metric === 'session' && row.dimension_key === '')
        ?.members,
    );
    mergedSummary.journeys = numberOrZero(
      exactIdentityRows.find((row) => row.metric === 'journey' && row.dimension_key === '')
        ?.members,
    );
  }

  const searchMap = new Map<string, WebsiteSearchRow>();
  for (const row of [...websiteSearchRows, ...rollupSearchRows] as WebsiteSearchRow[]) {
    const current = searchMap.get(row.term) ?? { term: row.term, searches: 0, zeroResults: 0 };
    current.searches += numberOrZero(row.searches);
    current.zeroResults += numberOrZero(row.zeroResults);
    searchMap.set(row.term, current);
  }

  const websiteProductRows: WebsiteTopProductRow[] = (websiteProductResult.rows as unknown[]).map(
    (row: unknown) => {
      const value = row as Record<string, unknown>;
      return {
        id: numberOrZero(value.id),
        title: String(value.title ?? ''),
        sku: value.sku == null ? null : String(value.sku),
        categoryName: value.category_name == null ? null : String(value.category_name),
        brandName: value.brand_name == null ? null : String(value.brand_name),
        viewCount: numberOrZero(value.view_count),
        addToCartCount: numberOrZero(value.add_to_cart_count),
        checkoutCount: numberOrZero(value.checkout_count),
        websitePurchaseCount: numberOrZero(value.website_purchase_count),
        popularityScore: numberOrZero(value.popularity_score),
        websiteConversionRate: numberOrZero(value.website_conversion_rate),
      } satisfies WebsiteTopProductRow;
    },
  );

  return {
    websiteSummaryRows: [mergedSummary],
    websiteSearchRows: Array.from(searchMap.values())
      .sort((left, right) => right.searches - left.searches)
      .slice(0, 8),
    websiteTopProductRows: websiteProductRows.slice(0, 8),
    websiteMetricRows: websiteProductRows satisfies WebsiteMetricRow[],
  };
}

export async function getMetaAdsTrackingData(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
) {
  const conditions = [];
  const rollupConditions = [];
  if (filters.startDate) {
    conditions.push(sql`${metaEventOutbox.eventTime} >= ${filters.startDate}::date`);
    rollupConditions.push(sql`${metaEventDailyRollups.day} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    conditions.push(
      sql`${metaEventOutbox.eventTime} < (${filters.endDate}::date + interval '1 day')`,
    );
    rollupConditions.push(sql`${metaEventDailyRollups.day} <= ${filters.endDate}::date`);
  }
  const metaWhere = conditions.length > 0 ? and(...conditions) : undefined;
  const rollupWhere = rollupConditions.length > 0 ? and(...rollupConditions) : undefined;
  const unrolledMetaWhere = and(
    metaWhere,
    sql`not exists (
    select 1 from ${metaEventDailyRollups} rollup
    where rollup.day = (${metaEventOutbox.eventTime} at time zone 'UTC')::date
  )`,
  );
  const pixelInvoked = sql`coalesce(${analyticsEvents.metadata}->'metaTracking'->'pixel'->>'invoked', 'false') = 'true'`;

  const [
    eventRows,
    payloadRows,
    [statusRow],
    coverageResult,
    [heartbeat],
    rollupEventRows,
    [rollupStatusRow],
  ] = await Promise.all([
    db
      .select({
        name: metaEventOutbox.eventName,
        total: sql<number>`count(*)::int`,
        pixelFired: sql<number>`count(*) filter (where ${pixelInvoked})::int`,
        capiSent: sql<number>`count(*) filter (where ${metaEventOutbox.attemptCount} > 0)::int`,
        capiDelivered: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'delivered')::int`,
        capiFailed: sql<number>`count(*) filter (where ${metaEventOutbox.status} in ('failed', 'skipped'))::int`,
        lastOccurredAt: sql<Date | null>`max(${metaEventOutbox.eventTime})`,
      })
      .from(metaEventOutbox)
      .leftJoin(analyticsEvents, eq(analyticsEvents.eventId, metaEventOutbox.eventId))
      .where(unrolledMetaWhere)
      .groupBy(metaEventOutbox.eventName)
      .orderBy(sql`2 desc, 1 asc`),
    db
      .select({
        eventId: metaEventOutbox.eventId,
        analyticsEventName: sql<string>`coalesce(${analyticsEvents.eventName}, ${metaEventOutbox.source})`,
        metaEventName: metaEventOutbox.eventName,
        pagePath: metaEventOutbox.eventSourceUrl,
        occurredAt: metaEventOutbox.eventTime,
        pixelPayload: sql<Record<string, unknown>>`jsonb_build_object('invoked', ${pixelInvoked})`,
        capiPayload: sql<Record<string, unknown>>`jsonb_build_object(
          'status', ${metaEventOutbox.status},
          'attemptCount', ${metaEventOutbox.attemptCount},
          'eventsReceived', ${metaEventOutbox.eventsReceived},
          'matchKeys', ${metaEventOutbox.matchKeySummary},
          'value', ${metaEventOutbox.customData}->'value',
          'numItems', ${metaEventOutbox.customData}->'num_items',
          'errorCode', ${metaEventOutbox.metaErrorCode},
          'errorSubcode', ${metaEventOutbox.metaErrorSubcode},
          'errorMessage', ${metaEventOutbox.metaErrorMessage},
          'fbtraceId', ${metaEventOutbox.fbtraceId}
        )`,
        capiStatus: metaEventOutbox.lastHttpStatus,
        capiOk: sql<boolean>`${metaEventOutbox.status} = 'delivered'`,
      })
      .from(metaEventOutbox)
      .leftJoin(analyticsEvents, eq(analyticsEvents.eventId, metaEventOutbox.eventId))
      .where(unrolledMetaWhere)
      .orderBy(desc(metaEventOutbox.eventTime))
      .limit(12),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'pending')::int`,
        retryable: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'retryable')::int`,
        delivered: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'delivered')::int`,
        failed: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'failed')::int`,
        skipped: sql<number>`count(*) filter (where ${metaEventOutbox.status} = 'skipped')::int`,
        oldestPendingAt: sql<Date | null>`min(${metaEventOutbox.createdAt}) filter (
          where ${metaEventOutbox.status} in ('pending', 'retryable', 'processing')
        )`,
      })
      .from(metaEventOutbox)
      .where(unrolledMetaWhere),
    db.execute(sql`
      select
        count(distinct attribution.order_id)::int as eligible_orders,
        count(distinct attribution.order_id) filter (
          where exists (
            select 1 from ${orderStatusHistory} history
            where history.order_id = attribution.order_id
              and history.status = ${ORDER_STATUS.CONFIRMED}
          )
        )::int as confirmed_orders,
        count(distinct purchase.order_id)::int as purchase_orders,
        count(distinct orderconfirmed.order_id)::int as orderconfirmed_orders,
        count(distinct purchase.order_id) filter (
          where current_order.confirmed in (${ORDER_STATUS.CANCELLED}, ${ORDER_STATUS.RETURNED}, ${ORDER_STATUS.FAILED})
        )::int as negative_outcome_purchases
      from ${orderMetaAttribution} attribution
      left join ${metaEventOutbox} purchase
        on purchase.order_id = attribution.order_id and purchase.event_name = 'Purchase'
      left join ${metaEventOutbox} orderconfirmed
        on orderconfirmed.order_id = attribution.order_id and orderconfirmed.event_name = 'orderconfirmed'
      left join ${orders} current_order on current_order.id = attribution.order_id
      where (${filters.startDate || null}::text is null or attribution.created_at::date >= ${filters.startDate || null})
        and (${filters.endDate || null}::text is null or attribution.created_at::date <= ${filters.endDate || null})
    `),
    db
      .select()
      .from(metaWorkerHeartbeat)
      .where(eq(metaWorkerHeartbeat.workerKey, 'storefront-meta-worker'))
      .limit(1),
    db
      .select({
        name: metaEventDailyRollups.eventName,
        total: sql<number>`sum(${metaEventDailyRollups.total})::int`,
        pixelFired: sql<number>`sum(${metaEventDailyRollups.pixelFired})::int`,
        capiSent: sql<number>`sum(${metaEventDailyRollups.capiSent})::int`,
        capiDelivered: sql<number>`sum(${metaEventDailyRollups.delivered})::int`,
        capiFailed: sql<number>`sum(${metaEventDailyRollups.failed} + ${metaEventDailyRollups.skipped})::int`,
        lastOccurredAt: sql<Date | null>`max(${metaEventDailyRollups.lastOccurredAt})`,
      })
      .from(metaEventDailyRollups)
      .where(rollupWhere)
      .groupBy(metaEventDailyRollups.eventName),
    db
      .select({
        delivered: sql<number>`coalesce(sum(${metaEventDailyRollups.delivered}), 0)::int`,
        failed: sql<number>`coalesce(sum(${metaEventDailyRollups.failed}), 0)::int`,
        skipped: sql<number>`coalesce(sum(${metaEventDailyRollups.skipped}), 0)::int`,
      })
      .from(metaEventDailyRollups)
      .where(rollupWhere),
  ]);
  const coverage = coverageResult.rows[0] as
    | {
        eligible_orders?: number | string;
        confirmed_orders?: number | string;
        orderconfirmed_orders?: number | string;
        purchase_orders?: number | string;
        negative_outcome_purchases?: number | string;
      }
    | undefined;

  const eventMap = new Map<string, MetaTrackedEventSummaryRow>();
  for (const row of [...eventRows, ...rollupEventRows] as MetaTrackedEventSummaryRow[]) {
    const current = eventMap.get(row.name) ?? {
      name: row.name,
      total: 0,
      pixelFired: 0,
      capiSent: 0,
      capiDelivered: 0,
      capiFailed: 0,
      lastOccurredAt: null,
    };
    current.total += numberOrZero(row.total);
    current.pixelFired += numberOrZero(row.pixelFired);
    current.capiSent += numberOrZero(row.capiSent);
    current.capiDelivered += numberOrZero(row.capiDelivered);
    current.capiFailed += numberOrZero(row.capiFailed);
    if (
      row.lastOccurredAt &&
      (!current.lastOccurredAt ||
        new Date(row.lastOccurredAt).getTime() > new Date(current.lastOccurredAt).getTime())
    ) {
      current.lastOccurredAt = row.lastOccurredAt;
    }
    eventMap.set(row.name, current);
  }

  return {
    eventRows: Array.from(eventMap.values()).sort(
      (left, right) => right.total - left.total || left.name.localeCompare(right.name),
    ),
    payloadRows: payloadRows as MetaTrackedEventLogRow[],
    health: {
      pending: statusRow?.pending ?? 0,
      retryable: statusRow?.retryable ?? 0,
      delivered: numberOrZero(statusRow?.delivered) + numberOrZero(rollupStatusRow?.delivered),
      failed: numberOrZero(statusRow?.failed) + numberOrZero(rollupStatusRow?.failed),
      skipped: numberOrZero(statusRow?.skipped) + numberOrZero(rollupStatusRow?.skipped),
      oldestPendingAt: toIsoDateString(statusRow?.oldestPendingAt),
      eligibleOrders: Number(coverage?.eligible_orders ?? 0),
      confirmedOrders: Number(coverage?.confirmed_orders ?? 0),
      orderConfirmedOrders: Number(coverage?.orderconfirmed_orders ?? 0),
      purchaseOrders: Number(coverage?.purchase_orders ?? 0),
      negativeOutcomePurchases: Number(coverage?.negative_outcome_purchases ?? 0),
      workerLastHeartbeatAt: toIsoDateString(heartbeat?.lastHeartbeatAt),
    },
  };
}

export async function getMetaPaidAttributionData(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
): Promise<MetaPaidAttributionStats> {
  const rawConditions = [];
  const rollupConditions = [];
  if (filters.startDate) {
    rawConditions.push(sql`${analyticsPaidClickVisits.firstSeenAt} >= ${filters.startDate}::date`);
    rollupConditions.push(sql`${analyticsPaidClickDailyRollups.day} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    rawConditions.push(
      sql`${analyticsPaidClickVisits.firstSeenAt} < (${filters.endDate}::date + interval '1 day')`,
    );
    rollupConditions.push(sql`${analyticsPaidClickDailyRollups.day} <= ${filters.endDate}::date`);
  }
  const rawWhere = rawConditions.length ? and(...rawConditions) : undefined;
  const rollupWhere = rollupConditions.length ? and(...rollupConditions) : undefined;
  const unrolledRawWhere = and(
    rawWhere,
    sql`not exists (
      select 1 from ${analyticsPaidClickDailyRollups} rollup
      where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date
    )`,
  );
  const [rawResult, rollupRows, campaignRows] = await Promise.all([
    db.execute(sql`
      select count(*)::int as visits,
        count(*) filter (where order_id is not null)::int as created_orders,
        count(*) filter (where purchase_count > 0)::int as purchases,
        count(*) filter (
          where order_id is null and purchase_count = 0 and event_count <= 1
        )::int as landed_only
      from ${analyticsPaidClickVisits}
      where ${unrolledRawWhere ?? sql`true`}
    `),
    db
      .select({
        visits: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.visits}), 0)::int`,
        createdOrders: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.createdOrder} + ${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
        purchases: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
        landedOnly: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.landedOnly}), 0)::int`,
      })
      .from(analyticsPaidClickDailyRollups)
      .where(rollupWhere),
    db
      .select({
        name: sql<string>`coalesce(nullif(${analyticsPaidClickVisits.utmCampaign}, ''), 'Unattributed Meta')`,
        visits: sql<number>`count(*)::int`,
        orders: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.orderId} is not null)::int`,
        purchases: sql<number>`count(*) filter (where ${analyticsPaidClickVisits.purchaseCount} > 0)::int`,
      })
      .from(analyticsPaidClickVisits)
      .where(unrolledRawWhere)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
  ]);
  const raw = (rawResult.rows[0] ?? {}) as Record<string, unknown>;
  const rollup = rollupRows[0];
  const visits = numberOrZero(raw.visits) + numberOrZero(rollup?.visits);
  const createdOrders = numberOrZero(raw.created_orders) + numberOrZero(rollup?.createdOrders);
  const purchases = numberOrZero(raw.purchases) + numberOrZero(rollup?.purchases);
  const landedOnly = numberOrZero(raw.landed_only) + numberOrZero(rollup?.landedOnly);

  return {
    visits,
    createdOrders,
    purchases,
    landedOnly,
    conversionRate: visits ? round((purchases / visits) * 100) : 0,
    topCampaigns: campaignRows.map(
      (row: { name: string; visits: number; orders: number; purchases: number }) => ({
        name: row.name,
        visits: numberOrZero(row.visits),
        orders: numberOrZero(row.orders),
        purchases: numberOrZero(row.purchases),
      }),
    ),
  };
}
