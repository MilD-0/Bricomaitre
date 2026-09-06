import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  metaEventDailyRollups,
  metaEventOutbox,
} from '@bric/db/schema';
import { numberOrZero } from './stats-values';
import type { StatsFilters } from './stats-contract';
import {
  buildAnalyticsRollupWhere,
  buildAnalyticsWhere,
  buildCanonicalStorefrontSessionsQuery,
  buildWebsiteProductMetricsQuery,
} from './stats-live-commerce';

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
): Promise<{
  websiteSummaryRows: WebsiteSummaryRow[];
  websiteSearchRows: WebsiteSearchRow[];
  websiteTopProductRows: WebsiteTopProductRow[];
  websiteMetricRows: WebsiteMetricRow[];
}> {
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

  const [eventRows, rollupEventRows] = await Promise.all([
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
  ]);
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
  };
}

export async function getMetaAttributedOrderCount(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
) {
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
  const [rawResult, rollupRows] = await Promise.all([
    db.execute(sql`
      select count(*) filter (where order_id is not null)::int as created_orders
      from ${analyticsPaidClickVisits}
      where ${unrolledRawWhere ?? sql`true`}
    `),
    db
      .select({
        createdOrders: sql<number>`coalesce(sum(${analyticsPaidClickDailyRollups.createdOrder} + ${analyticsPaidClickDailyRollups.purchased}), 0)::int`,
      })
      .from(analyticsPaidClickDailyRollups)
      .where(rollupWhere),
  ]);
  const raw = (rawResult.rows[0] ?? {}) as Record<string, unknown>;
  return numberOrZero(raw.created_orders) + numberOrZero(rollupRows[0]?.createdOrders);
}
