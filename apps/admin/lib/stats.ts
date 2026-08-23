import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  adCosts,
  adminReportingSnapshotRuns,
  adminReportingSnapshots,
  analyticsAcquisitionDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  analyticsSessions,
  brands,
  categories,
  metaEventOutbox,
  metaEventDailyRollups,
  metaWorkerHeartbeat,
  orderLineItems,
  orderMetaAttribution,
  orderStatusHistory,
  type UnmatchedImportRow,
  orders,
  processedOrderProducts,
  processedOrders,
  products,
} from '@bric/db/schema';
import { coerceOrderStatus, isConfirmedLifecycleStatus } from './orders';
import {
  emptyMetaCommerceReport,
  getMetaCommerceReport,
  type MetaCommerceReport,
} from './meta-commerce-analytics';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import {
  ADMIN_REPORTING_TIMEZONE,
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  emptyExperienceStats,
  getExperienceStats,
  getLiveAdminAiStats,
  getLiveStorefrontAiStats,
  type AiAssistantStats,
  type CustomerStats,
  type LandingPageStats,
  type MetaPaidAttributionStats,
  type WebsiteExperienceStats,
} from './stats-experience';
import { buildAdCostWhere } from './stats-ad-costs';
import { listImportHistory, type ImportHistoryItem } from './stats-order-import';
import { numberOrZero, round, toDateInput } from './stats-values';

const statsRangeSchema = z.enum(['all', '7d', '14d', '30d', '90d', 'year', 'custom']);
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const statsQuerySchema = z
  .object({
    range: statsRangeSchema.optional().default('30d'),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both custom dates.',
        path: ['startDate'],
      });
    }

    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date must be before end date.',
        path: ['startDate'],
      });
    }
  });

export type StatsFilters = z.infer<typeof statsQuerySchema>;

type UnmatchedOrderDetail = UnmatchedImportRow & {
  batchId: string;
};

type TrendPoint = {
  bucket: string;
  orders: number;
  revenue: number;
  profit: number;
  fees: number;
};

type BreakdownPoint = {
  name: string;
  orders: number;
  revenue: number;
  profit: number;
  collected?: number;
  fees?: number;
  netRevenue?: number;
  avgOrder?: number;
};

type ProductPerformance = {
  id: string;
  title: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  totalOrderCount?: number;
  confirmedOrderCount?: number;
  confirmationRate?: number | null;
  viewCount?: number;
  addToCartCount?: number;
  checkoutCount?: number;
  websitePurchaseCount?: number;
  popularityScore?: number;
  websiteConversionRate?: number;
};

type WebsiteSearchPoint = {
  term: string;
  searches: number;
  zeroResults: number;
};

type WebsiteFunnelPoint = {
  name: string;
  value: number;
};

type MetaTrackedEventSummary = {
  name: string;
  total: number;
  pixelFired: number;
  capiSent: number;
  capiDelivered: number;
  capiFailed: number;
  lastOccurredAt: string | null;
};

type MetaTrackedEventLog = {
  eventId: string;
  analyticsEventName: string;
  metaEventName: string;
  pagePath: string | null;
  occurredAt: string;
  pixelPayload: Record<string, unknown>;
  capiPayload: Record<string, unknown>;
  capiStatus: number | null;
  capiOk: boolean;
};

type ProfitabilityPoint = {
  name: string;
  value: number;
  fill: string;
};

export type StatsDashboardData = {
  filters: Required<StatsFilters>;
  snapshot?: {
    generatedAt: string;
    staleAt: string;
    isStale: boolean;
    trigger: string;
    sourceImportBatchId: string | null;
    reportThroughDate: string | null;
    financialDataIsLagging: boolean;
  };
  summary: {
    totalOrders: number;
    totalAmountCollected: number;
    totalFees: number;
    totalNetRevenue: number;
    totalProductCost: number;
    totalGrossProfit: number;
    adSpend: number;
    netProfitAfterAds: number;
    averageOrderValue: number;
    averageProfitPerOrder: number;
    profitMargin: number;
    profitMarginAfterAds: number;
    fulfillmentRate: number;
    matchedOrders: number;
    totalConfirmedOrders: number;
    profitableOrders: number;
    unprofitableOrders: number;
    breakEvenOrders: number;
  };
  trends: {
    daily: TrendPoint[];
    weekly: TrendPoint[];
    monthly: TrendPoint[];
    imports: TrendPoint[];
  };
  feeBreakdown: {
    livraison: number;
    poids: number;
    extra: number;
    sms: number;
    stockage: number;
    commission: number;
    total: number;
    avgPerOrder: number;
  };
  adCosts: {
    totalSpend: number;
    roas: number;
    cpa: number;
    cpc: number;
    ctr: number;
    conversionRate: number;
  };
  metaAds: {
    events: MetaTrackedEventSummary[];
    recentPayloads: MetaTrackedEventLog[];
    paidAttribution: MetaPaidAttributionStats;
    commerce: MetaCommerceReport;
    health?: {
      pending: number;
      retryable: number;
      delivered: number;
      failed: number;
      skipped: number;
      oldestPendingAt: string | null;
      eligibleOrders: number;
      confirmedOrders: number;
      orderConfirmedOrders: number;
      purchaseOrders: number;
      negativeOutcomePurchases: number;
      workerLastHeartbeatAt: string | null;
    };
  };
  wilayas: BreakdownPoint[];
  wilayaDetails: BreakdownPoint[];
  deliveries: BreakdownPoint[];
  topProducts: ProductPerformance[];
  allProducts: ProductPerformance[];
  topCategories: ProductPerformance[];
  topBrands: ProductPerformance[];
  profitability: ProfitabilityPoint[];
  importHistory: ImportHistoryItem[];
  latestUnmatchedReferences: string[];
  latestUnmatchedDetails: UnmatchedOrderDetail[];
  website: {
    sessions: number;
    journeys: number;
    pageViews: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    searches: number;
    zeroResultSearches: number;
    sessionConversionRate: number;
    viewToCartRate: number;
    cartToPurchaseRate: number;
    checkoutToPurchaseRate: number;
    topSearches: WebsiteSearchPoint[];
    funnel: WebsiteFunnelPoint[];
    topProducts: ProductPerformance[];
  } & WebsiteExperienceStats;
  landingPages: LandingPageStats;
  aiAssistants: AiAssistantStats;
  customers: CustomerStats;
};

const statsDateExpression = sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`;
const analyticsResultsCountExpression = sql<number>`case
  when coalesce(${analyticsEvents.metadata}->>'resultsCount', '') ~ '^-?[0-9]+$'
    then (${analyticsEvents.metadata}->>'resultsCount')::int
  else -1
end`;
const ADMIN_REPORTING_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
const ADMIN_REPORTING_STANDARD_INPUTS = [
  { range: '7d' },
  { range: '14d' },
  { range: '30d' },
  { range: '90d' },
  { range: 'year' },
  { range: 'all' },
] satisfies StatsFilters[];

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

type WebsiteMetricRow = {
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

function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getWebsiteAnalyticsData(
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

async function getOverviewWebsiteAnalytics(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
  purchases: number,
): Promise<StatsDashboardData['website']> {
  const analyticsWhere = buildAnalyticsWhere(filters);
  const rollupWhere = buildAnalyticsRollupWhere(filters);
  const unrolledAnalyticsWhere = and(
    analyticsWhere,
    sql`not exists (
      select 1 from ${analyticsDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        and rollup.dimension = 'overall'
        and rollup.dimension_key = ''
    )`,
  );
  const sessionConditions = [];
  if (filters.startDate) {
    sessionConditions.push(sql`${analyticsSessions.startedAt} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    sessionConditions.push(
      sql`${analyticsSessions.startedAt} < (${filters.endDate}::date + interval '1 day')`,
    );
  }
  const sessionWhere = sessionConditions.length ? and(...sessionConditions) : undefined;
  const [rawRows, rollupRows, sessionResult, engagementResult, errorResult] = await Promise.all([
    db
      .select({
        journeys: sql<number>`count(distinct ${analyticsEvents.journeyId})::int`,
        pageViews: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'page_view')::int`,
      })
      .from(analyticsEvents)
      .where(unrolledAnalyticsWhere),
    db
      .select({
        journeys: sql<number>`coalesce(sum(${analyticsDailyRollups.journeys}), 0)::int`,
        pageViews: sql<number>`coalesce(sum(${analyticsDailyRollups.pageViews}), 0)::int`,
      })
      .from(analyticsDailyRollups)
      .where(and(rollupWhere, eq(analyticsDailyRollups.dimension, 'overall'))),
    db.execute(sql`
      with filtered_sessions as (
        select ${analyticsSessions.id} as session_id, ${analyticsSessions.journeyId} as journey_id
        from ${analyticsSessions}
        where ${sessionWhere ?? sql`true`}
      ), returning_journeys as (
        select journey_id
        from filtered_sessions
        group by journey_id
        having count(*) > 1
      )
      select count(*)::int as sessions,
        (select count(*)::int from returning_journeys) as returning_journeys
      from filtered_sessions
    `),
    db.execute(sql`
      select count(*)::int as engaged_sessions
      from (
        select ${analyticsEvents.sessionId}
        from ${analyticsEvents}
        where ${analyticsWhere ?? sql`true`}
          and ${analyticsEvents.eventName} = 'page_view'
        group by ${analyticsEvents.sessionId}
        having count(*) > 1
      ) engaged
    `),
    db.execute(sql`
      select count(*)::int as errors,
        count(distinct ${analyticsEvents.sessionId})::int as error_sessions
      from ${analyticsEvents}
      where ${analyticsWhere ?? sql`true`}
        and ${analyticsEvents.eventName} in (
          'api_error',
          'order_create_failed',
          'order_verification_failed_after_create'
        )
    `),
  ]);
  const raw = rawRows[0];
  const rollup = rollupRows[0];
  const session = (sessionResult.rows[0] ?? {}) as Record<string, unknown>;
  const engagement = (engagementResult.rows[0] ?? {}) as Record<string, unknown>;
  const errors = (errorResult.rows[0] ?? {}) as Record<string, unknown>;
  const sessions = numberOrZero(session.sessions);
  const engagedSessions = numberOrZero(engagement.engaged_sessions);
  const errorEvents = numberOrZero(errors.errors);
  const errorSessions = numberOrZero(errors.error_sessions);
  const pageViews = numberOrZero(raw?.pageViews) + numberOrZero(rollup?.pageViews);
  const journeys = numberOrZero(raw?.journeys) + numberOrZero(rollup?.journeys);
  const fallback = emptyDashboard(filters).website;

  return {
    ...fallback,
    sessions,
    journeys,
    pageViews,
    purchases,
    engagedSessions,
    engagementRate: sessions ? round((engagedSessions / sessions) * 100) : 0,
    returningJourneys: numberOrZero(session.returning_journeys),
    errorEvents,
    errorRate: sessions ? round((errorSessions / sessions) * 100) : 0,
    sessionConversionRate: sessions ? round((purchases / sessions) * 100) : 0,
    funnel: [
      { name: 'Sessions', value: sessions },
      { name: 'Purchases', value: purchases },
    ].filter((item) => item.value > 0),
  };
}

async function getMetaAdsTrackingData(
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
              and history.status = 2
          )
        )::int as confirmed_orders,
        count(distinct purchase.order_id)::int as purchase_orders,
        count(distinct orderconfirmed.order_id)::int as orderconfirmed_orders,
        count(distinct purchase.order_id) filter (
          where current_order.confirmed in (6, 8, 9)
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

async function getMetaPaidAttributionData(
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

function buildResolvedFilters(input: StatsFilters): Required<StatsFilters> {
  const today = new Date();
  const endDate = toDateInput(today);
  let startDate = input.startDate ?? '';

  if (input.range === '7d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    startDate = toDateInput(start);
  }

  if (input.range === '14d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 13);
    startDate = toDateInput(start);
  }

  if (input.range === '30d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    startDate = toDateInput(start);
  }

  if (input.range === '90d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 89);
    startDate = toDateInput(start);
  }

  if (input.range === 'year') {
    startDate = `${today.getUTCFullYear()}-01-01`;
  }

  if (input.range === 'all') {
    return {
      range: input.range,
      startDate: '',
      endDate: '',
    };
  }

  if (input.range === 'custom') {
    return {
      range: input.range,
      startDate: input.startDate ?? '',
      endDate: input.endDate ?? '',
    };
  }

  return {
    range: input.range,
    startDate,
    endDate,
  };
}

function getSnapshotKey(filters: Required<StatsFilters>) {
  return `storefront-history-v4:${filters.range}:${filters.startDate || '*'}:${filters.endDate || '*'}`;
}

export function getReportThroughDate(data: StatsDashboardData) {
  const candidates = [
    ...data.trends.daily
      .filter((point) => point.revenue !== 0 || point.profit !== 0 || point.fees !== 0)
      .map((point) => point.bucket),
    ...data.trends.imports.map((point) => point.bucket),
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  return candidates.length > 0 ? candidates.sort().at(-1)! : null;
}

const FINANCIAL_COVERAGE_LAG_GRACE_DAYS = 3;

export function isFinancialDataLagging(reportThroughDate: string | null, selectedEndDate: string) {
  if (!selectedEndDate) return false;
  if (!reportThroughDate) return true;

  const reportTime = Date.parse(`${reportThroughDate}T00:00:00Z`);
  const endTime = Date.parse(`${selectedEndDate}T00:00:00Z`);
  return endTime - reportTime > FINANCIAL_COVERAGE_LAG_GRACE_DAYS * 24 * 60 * 60 * 1_000;
}

function withSnapshotMeta(
  data: StatsDashboardData,
  row: typeof adminReportingSnapshots.$inferSelect,
): StatsDashboardData {
  const filters = buildResolvedFilters(
    statsQuerySchema.parse({
      range: row.range as StatsFilters['range'],
      startDate: row.startDate ?? undefined,
      endDate: row.endDate ?? undefined,
    }),
  );
  const normalized = normalizeStatsDashboardData(data, filters);

  return {
    ...normalized,
    snapshot: {
      generatedAt: row.generatedAt.toISOString(),
      staleAt: row.staleAt.toISOString(),
      isStale: row.staleAt.getTime() < Date.now(),
      trigger: row.trigger,
      sourceImportBatchId: row.sourceImportBatchId,
      reportThroughDate: row.reportThroughDate,
      financialDataIsLagging: isFinancialDataLagging(row.reportThroughDate, filters.endDate),
    },
  };
}

function stripSnapshotMeta(data: StatsDashboardData) {
  const { snapshot, ...payload } = data;
  void snapshot;
  return payload;
}

async function readLatestStatsSnapshot(input: StatsFilters) {
  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const rows = await db
    .select()
    .from(adminReportingSnapshots)
    .where(eq(adminReportingSnapshots.snapshotKey, getSnapshotKey(filters)))
    .orderBy(desc(adminReportingSnapshots.generatedAt), desc(adminReportingSnapshots.id))
    .limit(1);
  const row = rows[0];

  return row ? withSnapshotMeta(row.payload as StatsDashboardData, row) : null;
}

function buildStatsWhere(filters: Required<StatsFilters>) {
  const conditions = [sql`${statsDateExpression} is not null`];

  if (filters.startDate) {
    conditions.push(sql`${statsDateExpression}::date >= ${filters.startDate}`);
  }

  if (filters.endDate) {
    conditions.push(sql`${statsDateExpression}::date <= ${filters.endDate}`);
  }

  return and(...conditions);
}

export function buildAnalyticsWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${analyticsEvents.occurredAt} >= ${filters.startDate}::date`);
  }

  if (filters.endDate) {
    conditions.push(
      sql`${analyticsEvents.occurredAt} < (${filters.endDate}::date + interval '1 day')`,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildCanonicalStorefrontSessionsQuery(filters: Required<StatsFilters>) {
  return sql`
    select (
      coalesce((select sum(sessions)::int from (
        select ${analyticsAcquisitionDailyRollups.day} as day,
          sum(${analyticsAcquisitionDailyRollups.sessions})::int as sessions
        from ${analyticsAcquisitionDailyRollups}
        where ${
          filters.startDate
            ? sql`${analyticsAcquisitionDailyRollups.day} >= ${filters.startDate}::date`
            : sql`true`
        }
          and ${
            filters.endDate
              ? sql`${analyticsAcquisitionDailyRollups.day} <= ${filters.endDate}::date`
              : sql`true`
          }
        group by ${analyticsAcquisitionDailyRollups.day}
        union all
        select ${analyticsDailyRollups.day}, ${analyticsDailyRollups.sessions}
        from ${analyticsDailyRollups}
        where ${analyticsDailyRollups.dimension} = 'overall'
          and ${analyticsDailyRollups.dimensionKey} = ''
          and ${
            filters.startDate
              ? sql`${analyticsDailyRollups.day} >= ${filters.startDate}::date`
              : sql`true`
          }
          and ${
            filters.endDate
              ? sql`${analyticsDailyRollups.day} <= ${filters.endDate}::date`
              : sql`true`
          }
          and not exists (
            select 1 from ${analyticsAcquisitionDailyRollups} acquisition
            where acquisition.day = ${analyticsDailyRollups.day}
          )
      ) rolled), 0)
      + coalesce((select count(distinct ${analyticsEvents.sessionId})::int
        from ${analyticsEvents}
        where ${
          filters.startDate
            ? sql`${analyticsEvents.occurredAt} >= ${filters.startDate}::date`
            : sql`true`
        }
          and ${
            filters.endDate
              ? sql`${analyticsEvents.occurredAt} < (${filters.endDate}::date + interval '1 day')`
              : sql`true`
          }
          and ${analyticsEvents.eventName} = 'page_view'
          and not exists (
            select 1 from ${analyticsDailyRollups} rollup
            where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
              and rollup.dimension = 'overall'
              and rollup.dimension_key = ''
          )
          and not exists (
            select 1 from ${analyticsAcquisitionDailyRollups} acquisition
            where acquisition.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
          )), 0)
    )::int as sessions
  `;
}

export async function getCanonicalStorefrontSessionCount(input: StatsFilters) {
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const result = await getDb().execute(buildCanonicalStorefrontSessionsQuery(filters));
  return numberOrZero((result.rows[0] as Record<string, unknown> | undefined)?.sessions);
}

function buildLiveOrderWhere(filters: Required<StatsFilters>) {
  const localOrderDate = sql`(${orders.createdAt} at time zone ${ADMIN_REPORTING_TIMEZONE})::date`;
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${localOrderDate} >= ${filters.startDate}::date`);
  }

  if (filters.endDate) {
    conditions.push(sql`${localOrderDate} <= ${filters.endDate}::date`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildLiveOrderSummaryQuery(filters: Required<StatsFilters>) {
  const where = buildLiveOrderWhere(filters);
  return sql`
    select count(*)::int as total_orders,
      count(*) filter (
        where ${inArray(orders.confirmed, [...CUSTOMER_SUCCESSFUL_ORDER_STATUSES])}
      )::int as successful_orders
    from ${orders}
    where ${where ?? sql`true`}
  `;
}

export function buildLiveOrderTrendQuery(filters: Required<StatsFilters>) {
  const where = buildLiveOrderWhere(filters);
  return sql`
    with filtered_orders as (
      select ${orders.createdAt} at time zone ${ADMIN_REPORTING_TIMEZONE} as local_created_at
      from ${orders}
      where ${where ?? sql`true`}
    )
    select 'daily' as grain,
      to_char(date_trunc('day', local_created_at), 'YYYY-MM-DD') as bucket,
      count(*)::int as orders
    from filtered_orders group by 1, 2
    union all
    select 'weekly' as grain,
      to_char(date_trunc('week', local_created_at), 'YYYY-MM-DD') as bucket,
      count(*)::int as orders
    from filtered_orders group by 1, 2
    union all
    select 'monthly' as grain,
      to_char(date_trunc('month', local_created_at), 'YYYY-MM') as bucket,
      count(*)::int as orders
    from filtered_orders group by 1, 2
    order by 1, 2
  `;
}

export function mergeLiveOrderTrend(
  financial: TrendPoint[],
  live: Array<{ bucket: string; orders: number }>,
) {
  const merged = new Map(financial.map((point) => [point.bucket, { ...point, orders: 0 }]));

  for (const point of live) {
    merged.set(point.bucket, {
      ...(merged.get(point.bucket) ?? {
        bucket: point.bucket,
        revenue: 0,
        profit: 0,
        fees: 0,
      }),
      orders: point.orders,
    });
  }

  return [...merged.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));
}

export function mergeCanonicalWebsitePurchases(
  website: StatsDashboardData['website'],
  purchases: number,
  dailyOrders?: Array<{ bucket: string; orders: number }>,
): StatsDashboardData['website'] {
  const funnel = [
    ...website.funnel.filter((item) => item.name !== 'Purchases'),
    ...(purchases > 0 ? [{ name: 'Purchases', value: purchases }] : []),
  ];

  const trend = dailyOrders
    ? (() => {
        const merged = new Map(
          website.trend.map((point) => [point.bucket, { ...point, purchases: 0 }]),
        );

        for (const point of dailyOrders) {
          merged.set(point.bucket, {
            ...(merged.get(point.bucket) ?? {
              bucket: point.bucket,
              sessions: 0,
              pageViews: 0,
              errors: 0,
            }),
            purchases: point.orders,
          });
        }

        return [...merged.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));
      })()
    : website.trend;

  return {
    ...website,
    purchases,
    trend,
    sessionConversionRate: website.sessions ? round((purchases / website.sessions) * 100) : 0,
    cartToPurchaseRate: website.addToCarts ? round((purchases / website.addToCarts) * 100) : 0,
    checkoutToPurchaseRate: website.checkoutStarts
      ? round((purchases / website.checkoutStarts) * 100)
      : 0,
    funnel,
  };
}

function buildAnalyticsRollupWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(sql`${analyticsDailyRollups.day} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    conditions.push(sql`${analyticsDailyRollups.day} <= ${filters.endDate}::date`);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildWebsiteProductMetricsQuery(filters: Required<StatsFilters>) {
  const analyticsWhere = buildAnalyticsWhere(filters);
  const rollupWhere = buildAnalyticsRollupWhere(filters);
  const orderWhere = buildLiveOrderWhere(filters);
  const unrolledAnalyticsWhere = and(
    analyticsWhere,
    sql`not exists (
      select 1 from ${analyticsDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        and rollup.dimension = 'overall'
        and rollup.dimension_key = ''
    )`,
  );

  return sql`
    with raw_product_engagement as (
      select ${analyticsEvents.productId} as product_id,
        count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int as view_count,
        count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int as add_to_cart_count,
        count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int as checkout_count
      from ${analyticsEvents}
      where ${unrolledAnalyticsWhere ?? sql`true`}
        and ${analyticsEvents.productId} is not null
      group by ${analyticsEvents.productId}
    ), rollup_product_engagement as (
      select case when ${analyticsDailyRollups.dimensionKey} ~ '^[0-9]+$'
          then ${analyticsDailyRollups.dimensionKey}::bigint end as product_id,
        coalesce(sum(${analyticsDailyRollups.productViews}), 0)::int as view_count,
        coalesce(sum(${analyticsDailyRollups.addToCarts}), 0)::int as add_to_cart_count,
        coalesce(sum(${analyticsDailyRollups.checkoutStarts}), 0)::int as checkout_count
      from ${analyticsDailyRollups}
      where ${rollupWhere ?? sql`true`}
        and ${analyticsDailyRollups.dimension} = 'product'
      group by ${analyticsDailyRollups.dimensionKey}
    ), merged_product_engagement as (
      select product_id,
        sum(view_count)::int as view_count,
        sum(add_to_cart_count)::int as add_to_cart_count,
        sum(checkout_count)::int as checkout_count
      from (
        select * from raw_product_engagement
        union all
        select * from rollup_product_engagement
      ) source
      where product_id is not null
      group by product_id
    ), normalized_order_products as (
      select ${orderLineItems.orderId} as order_id, ${orderLineItems.productId} as product_id
      from ${orderLineItems}
      inner join ${orders} on ${orders.id} = ${orderLineItems.orderId}
      where ${orderWhere ?? sql`true`}
        and ${orderLineItems.productId} is not null
    ), legacy_order_products as (
      select ${orders.id} as order_id, matched.product_id
      from ${orders}
      cross join lateral unnest(${orders.cartProducts}) product_ref
      inner join lateral (
        select ${products.id} as product_id
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
      where ${orderWhere ?? sql`true`}
        and not exists (
          select 1 from ${orderLineItems}
          where ${orderLineItems.orderId} = ${orders.id}
        )
    ), order_product_purchases as (
      select product_id, count(distinct order_id)::int as purchase_count
      from (
        select order_id, product_id from normalized_order_products
        union all
        select order_id, product_id from legacy_order_products
      ) order_products
      group by product_id
    ), combined_product_metrics as (
      select coalesce(engagement.product_id, purchases.product_id) as product_id,
        coalesce(engagement.view_count, 0)::int as view_count,
        coalesce(engagement.add_to_cart_count, 0)::int as add_to_cart_count,
        coalesce(engagement.checkout_count, 0)::int as checkout_count,
        coalesce(purchases.purchase_count, 0)::int as purchase_count
      from merged_product_engagement engagement
      full join order_product_purchases purchases on purchases.product_id = engagement.product_id
    )
    select product.id, product.title, product.sku,
      category.name as category_name, brand.name as brand_name,
      metrics.view_count, metrics.add_to_cart_count, metrics.checkout_count,
      metrics.purchase_count as website_purchase_count,
      (metrics.view_count + metrics.add_to_cart_count * 4 + metrics.checkout_count * 7 + metrics.purchase_count * 10)::double precision as popularity_score,
      coalesce(metrics.purchase_count::double precision / nullif(metrics.view_count, 0), 0) as website_conversion_rate
    from combined_product_metrics metrics
    join ${products} product on product.id = metrics.product_id
    left join ${categories} category on category.id = product.category_id
    left join ${brands} brand on brand.id = product.brand_id
    order by popularity_score desc, metrics.view_count desc
  `;
}

export type LiveWebsiteProductMetric = {
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

export async function getLiveWebsiteProductMetrics(
  input: StatsFilters,
): Promise<LiveWebsiteProductMetric[]> {
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const result = await getDb().execute(buildWebsiteProductMetricsQuery(filters));

  return (result.rows as Array<Record<string, unknown>>).map((row): LiveWebsiteProductMetric => ({
    id: numberOrZero(row.id),
    title: String(row.title ?? ''),
    sku: row.sku == null ? null : String(row.sku),
    categoryName: row.category_name == null ? null : String(row.category_name),
    brandName: row.brand_name == null ? null : String(row.brand_name),
    viewCount: numberOrZero(row.view_count),
    addToCartCount: numberOrZero(row.add_to_cart_count),
    checkoutCount: numberOrZero(row.checkout_count),
    websitePurchaseCount: numberOrZero(row.website_purchase_count),
    popularityScore: round(numberOrZero(row.popularity_score)),
    websiteConversionRate: round(numberOrZero(row.website_conversion_rate) * 100),
  }));
}

function emptyDashboard(filters: Required<StatsFilters>): StatsDashboardData {
  const experience = emptyExperienceStats();
  return {
    filters,
    summary: {
      totalOrders: 0,
      totalAmountCollected: 0,
      totalFees: 0,
      totalNetRevenue: 0,
      totalProductCost: 0,
      totalGrossProfit: 0,
      adSpend: 0,
      netProfitAfterAds: 0,
      averageOrderValue: 0,
      averageProfitPerOrder: 0,
      profitMargin: 0,
      profitMarginAfterAds: 0,
      fulfillmentRate: 0,
      matchedOrders: 0,
      totalConfirmedOrders: 0,
      profitableOrders: 0,
      unprofitableOrders: 0,
      breakEvenOrders: 0,
    },
    trends: {
      daily: [],
      weekly: [],
      monthly: [],
      imports: [],
    },
    feeBreakdown: {
      livraison: 0,
      poids: 0,
      extra: 0,
      sms: 0,
      stockage: 0,
      commission: 0,
      total: 0,
      avgPerOrder: 0,
    },
    adCosts: {
      totalSpend: 0,
      roas: 0,
      cpa: 0,
      cpc: 0,
      ctr: 0,
      conversionRate: 0,
    },
    metaAds: {
      events: [],
      recentPayloads: [],
      paidAttribution: experience.metaPaidAttribution,
      commerce: emptyMetaCommerceReport(),
    },
    wilayas: [],
    wilayaDetails: [],
    deliveries: [],
    topProducts: [],
    allProducts: [],
    topCategories: [],
    topBrands: [],
    profitability: [],
    importHistory: [],
    latestUnmatchedReferences: [],
    latestUnmatchedDetails: [],
    website: {
      sessions: 0,
      journeys: 0,
      pageViews: 0,
      productViews: 0,
      addToCarts: 0,
      checkoutStarts: 0,
      purchases: 0,
      searches: 0,
      zeroResultSearches: 0,
      sessionConversionRate: 0,
      viewToCartRate: 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      topSearches: [],
      funnel: [],
      topProducts: [],
      ...experience.website,
    },
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
    customers: experience.customers,
  };
}

export function normalizeStatsDashboardData(
  payload: unknown,
  filters: Required<StatsFilters>,
): StatsDashboardData {
  const fallback = emptyDashboard(filters);
  const data =
    payload && typeof payload === 'object' ? (payload as Partial<StatsDashboardData>) : {};
  const website = data.website ?? fallback.website;
  const metaAds = data.metaAds ?? fallback.metaAds;
  const landingPages = data.landingPages ?? fallback.landingPages;
  const aiAssistants = data.aiAssistants ?? fallback.aiAssistants;
  const customers = data.customers ?? fallback.customers;

  return {
    ...fallback,
    ...data,
    filters,
    summary: { ...fallback.summary, ...(data.summary ?? {}) },
    trends: { ...fallback.trends, ...(data.trends ?? {}) },
    feeBreakdown: { ...fallback.feeBreakdown, ...(data.feeBreakdown ?? {}) },
    adCosts: { ...fallback.adCosts, ...(data.adCosts ?? {}) },
    metaAds: {
      ...fallback.metaAds,
      ...metaAds,
      paidAttribution: {
        ...fallback.metaAds.paidAttribution,
        ...(metaAds.paidAttribution ?? {}),
      },
      commerce: {
        ...fallback.metaAds.commerce,
        ...(metaAds.commerce ?? {}),
        summary: {
          ...fallback.metaAds.commerce.summary,
          ...(metaAds.commerce?.summary ?? {}),
        },
        rows: metaAds.commerce?.rows ?? fallback.metaAds.commerce.rows,
        sync: metaAds.commerce?.sync ?? fallback.metaAds.commerce.sync,
      },
    },
    website: { ...fallback.website, ...website },
    landingPages: {
      ...fallback.landingPages,
      ...landingPages,
      summary: {
        ...fallback.landingPages.summary,
        ...(landingPages.summary ?? {}),
      },
    },
    aiAssistants: {
      admin: {
        ...fallback.aiAssistants.admin,
        ...(aiAssistants.admin ?? {}),
      },
      storefront: {
        ...fallback.aiAssistants.storefront,
        ...(aiAssistants.storefront ?? {}),
      },
    },
    customers: {
      ...fallback.customers,
      ...customers,
      summary: {
        ...fallback.customers.summary,
        ...(customers.summary ?? {}),
      },
    },
  };
}

async function computeStatsDashboard(input: StatsFilters) {
  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const where = buildStatsWhere(filters);
  const adWhere = buildAdCostWhere(filters);
  const analyticsWhere = buildAnalyticsWhere(filters);
  const analyticsRollupWhere = buildAnalyticsRollupWhere(filters);
  const websiteAnalyticsPromise = getWebsiteAnalyticsData(
    db,
    analyticsWhere,
    analyticsRollupWhere,
    filters,
  );
  const metaAdsTrackingPromise = getMetaAdsTrackingData(db, filters);
  const experienceStatsPromise = getExperienceStats(db, filters);

  const [
    summaryRows,
    liveOrderSummary,
    dailyTrendRows,
    monthlyTrendRows,
    weeklyTrendRows,
    importTrendRows,
    wilayaRows,
    deliveryRows,
    productRows,
    importHistory,
    adSpendRows,
    allOrdersRows,
  ] = await Promise.all([
    db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalAmountCollected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        totalNetRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        totalProductCost: sql<number>`coalesce(sum(${processedOrders.productCost})::double precision, 0)`,
        totalGrossProfit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        feeLivraison: sql<number>`coalesce(sum(${processedOrders.feeLivraison})::double precision, 0)`,
        feePoids: sql<number>`coalesce(sum(${processedOrders.feePoids})::double precision, 0)`,
        feeExtra: sql<number>`coalesce(sum(${processedOrders.feeExtra})::double precision, 0)`,
        feeSms: sql<number>`coalesce(sum(${processedOrders.feeSms})::double precision, 0)`,
        feeStockage: sql<number>`coalesce(sum(${processedOrders.feeStockage})::double precision, 0)`,
        feeCommission: sql<number>`coalesce(sum(${processedOrders.feeCommission})::double precision, 0)`,
        profitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} > 0)::int`,
        unprofitableOrders: sql<number>`count(*) filter (where ${processedOrders.profit} < 0)::int`,
        breakEvenOrders: sql<number>`count(*) filter (where ${processedOrders.profit} = 0)::int`,
      })
      .from(processedOrders)
      .where(where),
    getLiveOrderSummary(db, filters),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${statsDateExpression}), 'YYYY-MM')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('week', ${statsDateExpression}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${processedOrders.importedAt}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.wilaya}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`3 desc`)
      .limit(8),
    db
      .select({
        name: sql<string>`coalesce(nullif(${processedOrders.deliveryType}, ''), 'Unknown')`,
        orders: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        revenue: sql<number>`coalesce(sum(${processedOrders.amountCollected})::double precision, 0)`,
        fees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        netRevenue: sql<number>`coalesce(sum(${processedOrders.netRevenue})::double precision, 0)`,
        profit: sql<number>`coalesce(sum(${processedOrders.profit})::double precision, 0)`,
      })
      .from(processedOrders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({
        productId: processedOrderProducts.productId,
        title: processedOrderProducts.title,
        sku: processedOrderProducts.sku,
        price: sql<number>`coalesce(${processedOrderProducts.price}, 0)::double precision`,
        cost: sql<number>`coalesce(${processedOrderProducts.cost}, 0)::double precision`,
        categoryName: processedOrderProducts.categoryName,
        brandName: processedOrderProducts.brandName,
        categoryId: processedOrderProducts.categoryId,
        brandId: processedOrderProducts.brandId,
      })
      .from(processedOrders)
      .innerJoin(
        processedOrderProducts,
        eq(processedOrders.id, processedOrderProducts.processedOrderId),
      )
      .where(where),
    listImportHistory(),
    db
      .select({
        spend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
        impressions: sql<number>`coalesce(sum(${adCosts.impressions})::int, 0)`,
        clicks: sql<number>`coalesce(sum(${adCosts.clicks})::int, 0)`,
        conversions: sql<number>`coalesce(sum(${adCosts.conversions})::int, 0)`,
      })
      .from(adCosts)
      .where(adWhere),
    db.select({ cartProducts: orders.cartProducts, confirmed: orders.confirmed }).from(orders),
  ]);
  const { websiteSummaryRows, websiteSearchRows, websiteTopProductRows, websiteMetricRows } =
    await websiteAnalyticsPromise;
  const {
    eventRows: metaEventRows,
    payloadRows: metaPayloadRows,
    health: metaHealth,
  } = await metaAdsTrackingPromise;
  const experience = await experienceStatsPromise;

  const summaryRow = summaryRows[0];
  const adSummary = adSpendRows[0];
  const websiteSummary = websiteSummaryRows[0];
  const adSpend = round(numberOrZero(adSummary?.spend));
  const totalOrders = liveOrderSummary.totalOrders;
  const totalConfirmedOrders = liveOrderSummary.successfulOrders;
  const websiteProductMetricsById = new Map<string, Omit<WebsiteMetricRow, 'id'>>(
    websiteMetricRows.map((row: WebsiteMetricRow) => [
      String(row.id),
      {
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      },
    ]),
  );
  const website = mergeCanonicalWebsitePurchases(
    {
      sessions: websiteSummary?.sessions ?? 0,
      journeys: websiteSummary?.journeys ?? 0,
      pageViews: websiteSummary?.pageViews ?? 0,
      productViews: websiteSummary?.productViews ?? 0,
      addToCarts: websiteSummary?.addToCarts ?? 0,
      checkoutStarts: websiteSummary?.checkoutStarts ?? 0,
      purchases: 0,
      searches: websiteSummary?.searches ?? 0,
      zeroResultSearches: websiteSummary?.zeroResultSearches ?? 0,
      sessionConversionRate: 0,
      viewToCartRate: websiteSummary?.productViews
        ? round(((websiteSummary?.addToCarts ?? 0) / websiteSummary.productViews) * 100)
        : 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      topSearches: websiteSearchRows.map((row) => ({
        term: row.term,
        searches: row.searches,
        zeroResults: row.zeroResults,
      })),
      funnel: [
        { name: 'Sessions', value: websiteSummary?.sessions ?? 0 },
        { name: 'Product views', value: websiteSummary?.productViews ?? 0 },
        { name: 'Adds to cart', value: websiteSummary?.addToCarts ?? 0 },
        { name: 'Checkout starts', value: websiteSummary?.checkoutStarts ?? 0 },
      ].filter((item) => item.value > 0),
      topProducts: websiteTopProductRows.map((row) => ({
        id: String(row.id),
        title: row.title,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        sku: row.sku,
        categoryName: row.categoryName,
        brandName: row.brandName,
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      })),
      ...experience.website,
    },
    totalOrders,
  );
  const metaAds = {
    events: metaEventRows.map((row) => ({
      name: row.name,
      total: row.total,
      pixelFired: row.pixelFired,
      capiSent: row.capiSent,
      capiDelivered: row.capiDelivered,
      capiFailed: row.capiFailed,
      lastOccurredAt: toIsoDateString(row.lastOccurredAt),
    })),
    recentPayloads: metaPayloadRows.map((row) => ({
      eventId: row.eventId,
      analyticsEventName: row.analyticsEventName,
      metaEventName: row.metaEventName,
      pagePath: row.pagePath,
      occurredAt: toIsoDateString(row.occurredAt) ?? new Date(0).toISOString(),
      pixelPayload: row.pixelPayload,
      capiPayload: row.capiPayload,
      capiStatus: row.capiStatus,
      capiOk: row.capiOk,
    })),
    health: metaHealth,
    paidAttribution: experience.metaPaidAttribution,
    commerce: emptyMetaCommerceReport(),
  };

  if (!summaryRow || summaryRow.totalOrders === 0) {
    const data = emptyDashboard(filters);
    data.summary.totalOrders = totalOrders;
    data.summary.totalConfirmedOrders = totalConfirmedOrders;
    data.importHistory = importHistory;
    data.latestUnmatchedReferences = importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [];
    data.latestUnmatchedDetails = (importHistory[0]?.unmatchedDetails ?? [])
      .slice(0, 8)
      .map((item) => ({
        ...item,
        batchId: importHistory[0]!.batchId,
      }));
    data.website = website;
    data.metaAds = metaAds;
    data.landingPages = experience.landingPages;
    data.aiAssistants = experience.aiAssistants;
    data.customers = experience.customers;
    return data;
  }

  const productMap = new Map<string, ProductPerformance>();
  const categoryMap = new Map<string, ProductPerformance>();
  const brandMap = new Map<string, ProductPerformance>();
  const orderCountsByProduct = new Map<string, { total: number; confirmed: number }>();
  const cartProductReferences = collectCartProductReferenceBuckets(allOrdersRows);
  const orderLookupRows =
    cartProductReferences.productIds.length === 0 && cartProductReferences.mongoIds.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            mongoId: products.mongoId,
          })
          .from(products)
          .where(
            or(
              ...(cartProductReferences.productIds.length > 0
                ? [inArray(products.id, cartProductReferences.productIds)]
                : []),
              ...(cartProductReferences.mongoIds.length > 0
                ? [inArray(products.mongoId, cartProductReferences.mongoIds)]
                : []),
            ),
          );
  const orderProductLookup = buildCartProductLookup(orderLookupRows);

  for (const order of allOrdersRows) {
    const uniqueProducts = [
      ...new Set(
        (order.cartProducts ?? [])
          .map((value) => getCartProductLookupKey(value))
          .filter((value): value is string => Boolean(value))
          .map((lookupKey) => orderProductLookup.get(lookupKey))
          .filter((value): value is NonNullable<typeof value> => Boolean(value))
          .map((product) => String(product.id)),
      ),
    ];
    for (const productId of uniqueProducts) {
      const entry = orderCountsByProduct.get(productId) ?? { total: 0, confirmed: 0 };
      entry.total += 1;
      if (isConfirmedLifecycleStatus(coerceOrderStatus(order.confirmed))) {
        entry.confirmed += 1;
      }
      orderCountsByProduct.set(productId, entry);
    }
  }

  for (const row of productRows) {
    const productId = row.productId ?? row.title ?? 'unknown-product';
    const productKey = String(productId);
    const categoryKey = row.categoryId ?? row.categoryName ?? 'uncategorized';
    const brandKey = row.brandId ?? row.brandName ?? 'unbranded';
    const itemProfit = numberOrZero(row.price) - numberOrZero(row.cost);

    const currentProduct = productMap.get(productKey) ?? {
      id: productKey,
      title: row.title ?? 'Untitled product',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: row.sku,
      categoryName: row.categoryName,
      brandName: row.brandName,
    };

    currentProduct.unitsSold += 1;
    currentProduct.revenue += numberOrZero(row.price);
    currentProduct.cost += numberOrZero(row.cost);
    currentProduct.profit += itemProfit;
    productMap.set(productKey, currentProduct);

    const currentCategory = categoryMap.get(String(categoryKey)) ?? {
      id: String(categoryKey),
      title: row.categoryName ?? 'Uncategorized',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: row.categoryName,
      brandName: null,
    };

    currentCategory.unitsSold += 1;
    currentCategory.revenue += numberOrZero(row.price);
    currentCategory.cost += numberOrZero(row.cost);
    currentCategory.profit += itemProfit;
    categoryMap.set(String(categoryKey), currentCategory);

    const currentBrand = brandMap.get(String(brandKey)) ?? {
      id: String(brandKey),
      title: row.brandName ?? 'Unbranded',
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      sku: null,
      categoryName: null,
      brandName: row.brandName,
    };

    currentBrand.unitsSold += 1;
    currentBrand.revenue += numberOrZero(row.price);
    currentBrand.cost += numberOrZero(row.cost);
    currentBrand.profit += itemProfit;
    brandMap.set(String(brandKey), currentBrand);
  }

  const enrichPerformance = (items: ProductPerformance[]) =>
    items
      .map((item) => ({
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: item.totalOrderCount,
        confirmedOrderCount: item.confirmedOrderCount,
        confirmationRate:
          item.totalOrderCount && item.totalOrderCount > 10
            ? round(((item.confirmedOrderCount ?? 0) / item.totalOrderCount) * 100)
            : null,
      }))
      .sort((left, right) => right.profit - left.profit)
      .slice(0, 8);

  const allProducts = Array.from(productMap.values())
    .map((item) => {
      const counts = orderCountsByProduct.get(item.id);
      const websiteMetrics = websiteProductMetricsById.get(item.id);
      return {
        ...item,
        revenue: round(item.revenue),
        cost: round(item.cost),
        profit: round(item.profit),
        margin: item.revenue > 0 ? round((item.profit / item.revenue) * 100) : 0,
        totalOrderCount: counts?.total ?? 0,
        confirmedOrderCount: counts?.confirmed ?? 0,
        confirmationRate:
          counts && counts.total > 10 ? round((counts.confirmed / counts.total) * 100) : null,
        viewCount: websiteMetrics?.viewCount ?? 0,
        addToCartCount: websiteMetrics?.addToCartCount ?? 0,
        checkoutCount: websiteMetrics?.checkoutCount ?? 0,
        websitePurchaseCount: websiteMetrics?.websitePurchaseCount ?? 0,
        popularityScore: websiteMetrics?.popularityScore ?? 0,
        websiteConversionRate: websiteMetrics?.websiteConversionRate ?? 0,
      };
    })
    .sort((left, right) => right.unitsSold - left.unitsSold);

  const totalGrossProfit = round(numberOrZero(summaryRow.totalGrossProfit));
  const totalNetRevenue = round(numberOrZero(summaryRow.totalNetRevenue));
  const matchedOrders = summaryRow.totalOrders;
  const netProfitAfterAds = round(totalGrossProfit - adSpend);

  return {
    filters,
    summary: {
      totalOrders,
      totalAmountCollected: round(numberOrZero(summaryRow.totalAmountCollected)),
      totalFees: round(numberOrZero(summaryRow.totalFees)),
      totalNetRevenue,
      totalProductCost: round(numberOrZero(summaryRow.totalProductCost)),
      totalGrossProfit,
      adSpend,
      netProfitAfterAds,
      averageOrderValue:
        matchedOrders > 0
          ? round(numberOrZero(summaryRow.totalAmountCollected) / matchedOrders)
          : 0,
      averageProfitPerOrder: matchedOrders > 0 ? round(totalGrossProfit / matchedOrders) : 0,
      profitMargin: totalNetRevenue > 0 ? round((totalGrossProfit / totalNetRevenue) * 100) : 0,
      profitMarginAfterAds:
        totalNetRevenue > 0 ? round((netProfitAfterAds / totalNetRevenue) * 100) : 0,
      fulfillmentRate:
        totalConfirmedOrders > 0 ? round((matchedOrders / totalConfirmedOrders) * 100) : 0,
      matchedOrders,
      totalConfirmedOrders,
      profitableOrders: summaryRow.profitableOrders,
      unprofitableOrders: summaryRow.unprofitableOrders,
      breakEvenOrders: summaryRow.breakEvenOrders,
    },
    trends: {
      daily: dailyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      weekly: weeklyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      monthly: monthlyTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
      imports: importTrendRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        fees: round(numberOrZero(row.fees)),
      })),
    },
    feeBreakdown: {
      livraison: round(numberOrZero(summaryRow.feeLivraison)),
      poids: round(numberOrZero(summaryRow.feePoids)),
      extra: round(numberOrZero(summaryRow.feeExtra)),
      sms: round(numberOrZero(summaryRow.feeSms)),
      stockage: round(numberOrZero(summaryRow.feeStockage)),
      commission: round(numberOrZero(summaryRow.feeCommission)),
      total: round(numberOrZero(summaryRow.totalFees)),
      avgPerOrder:
        matchedOrders > 0 ? round(numberOrZero(summaryRow.totalFees) / matchedOrders) : 0,
    },
    adCosts: {
      totalSpend: adSpend,
      roas: adSpend > 0 ? round(totalNetRevenue / adSpend) : 0,
      cpa: totalOrders > 0 ? round(adSpend / totalOrders) : 0,
      cpc:
        numberOrZero(adSummary?.clicks) > 0 ? round(adSpend / numberOrZero(adSummary?.clicks)) : 0,
      ctr:
        numberOrZero(adSummary?.impressions) > 0
          ? round((numberOrZero(adSummary?.clicks) / numberOrZero(adSummary?.impressions)) * 100)
          : 0,
      conversionRate:
        numberOrZero(adSummary?.clicks) > 0
          ? round((numberOrZero(adSummary?.conversions) / numberOrZero(adSummary?.clicks)) * 100)
          : 0,
    },
    metaAds,
    wilayas: wilayaRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      profit: round(numberOrZero(row.profit)),
    })),
    wilayaDetails: wilayaRows
      .map((row) => ({
        name: row.name,
        orders: row.orders,
        collected: round(numberOrZero(row.collected)),
        fees: round(numberOrZero(row.fees)),
        revenue: round(numberOrZero(row.revenue)),
        profit: round(numberOrZero(row.profit)),
        avgOrder: row.orders > 0 ? round(numberOrZero(row.revenue) / row.orders) : 0,
      }))
      .sort((left, right) => right.orders - left.orders),
    deliveries: deliveryRows.map((row) => ({
      name: row.name,
      orders: row.orders,
      revenue: round(numberOrZero(row.revenue)),
      collected: round(numberOrZero(row.collected)),
      profit: round(numberOrZero(row.profit)),
      fees: round(numberOrZero(row.fees)),
      netRevenue: round(numberOrZero(row.netRevenue)),
    })),
    topProducts: enrichPerformance(
      Array.from(productMap.values()).map((item) => {
        const counts = orderCountsByProduct.get(item.id);
        return {
          ...item,
          totalOrderCount: counts?.total ?? 0,
          confirmedOrderCount: counts?.confirmed ?? 0,
        };
      }),
    ),
    allProducts,
    topCategories: enrichPerformance(Array.from(categoryMap.values())),
    topBrands: enrichPerformance(Array.from(brandMap.values())),
    profitability: [
      { name: 'Profitable', value: summaryRow.profitableOrders, fill: 'var(--chart-2)' },
      { name: 'Break-even', value: summaryRow.breakEvenOrders, fill: 'var(--chart-4)' },
      { name: 'Loss-making', value: summaryRow.unprofitableOrders, fill: 'var(--chart-5)' },
    ].filter((item) => item.value > 0),
    importHistory,
    latestUnmatchedReferences: importHistory[0]?.unmatchedReferences.slice(0, 8) ?? [],
    latestUnmatchedDetails: (importHistory[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
      ...item,
      batchId: importHistory[0]!.batchId,
    })),
    website,
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
    customers: experience.customers,
  };
}

export async function getStatsDashboardSection(
  input: StatsFilters,
  section: 'overview' | 'time' | 'metaAds',
) {
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const db = getDb();
  const dashboard = emptyDashboard(filters);

  if (section === 'time') {
    const live = await getLiveOrderAnalytics(db, filters);
    return {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        totalOrders: live.totalOrders,
        totalConfirmedOrders: live.successfulOrders,
      },
      trends: {
        daily: live.trends.daily.map((point: { bucket: string; orders: number }) => ({
          ...point,
          revenue: 0,
          profit: 0,
          fees: 0,
        })),
        weekly: live.trends.weekly.map((point: { bucket: string; orders: number }) => ({
          ...point,
          revenue: 0,
          profit: 0,
          fees: 0,
        })),
        monthly: live.trends.monthly.map((point: { bucket: string; orders: number }) => ({
          ...point,
          revenue: 0,
          profit: 0,
          fees: 0,
        })),
        imports: [],
      },
    } satisfies StatsDashboardData;
  }

  if (section === 'overview') {
    const where = buildStatsWhere(filters);
    const [live, financialRows] = await Promise.all([
      getLiveOrderSummary(db, filters),
      db
        .select({
          matchedOrders: sql<number>`count(*)::int`,
          productCost: sql<number>`coalesce(sum(${processedOrders.productCost})::double precision, 0)`,
          livraison: sql<number>`coalesce(sum(${processedOrders.feeLivraison})::double precision, 0)`,
          poids: sql<number>`coalesce(sum(${processedOrders.feePoids})::double precision, 0)`,
          extra: sql<number>`coalesce(sum(${processedOrders.feeExtra})::double precision, 0)`,
          sms: sql<number>`coalesce(sum(${processedOrders.feeSms})::double precision, 0)`,
          stockage: sql<number>`coalesce(sum(${processedOrders.feeStockage})::double precision, 0)`,
          commission: sql<number>`coalesce(sum(${processedOrders.feeCommission})::double precision, 0)`,
          totalFees: sql<number>`coalesce(sum(${processedOrders.totalFees})::double precision, 0)`,
        })
        .from(processedOrders)
        .where(where),
    ]);
    const website = await getOverviewWebsiteAnalytics(db, filters, live.totalOrders);
    const financial = financialRows[0];
    const matchedOrders = numberOrZero(financial?.matchedOrders);
    const totalFees = round(numberOrZero(financial?.totalFees));

    return {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        totalOrders: live.totalOrders,
        totalConfirmedOrders: live.successfulOrders,
        matchedOrders,
        totalProductCost: round(numberOrZero(financial?.productCost)),
        fulfillmentRate: live.successfulOrders
          ? round((matchedOrders / live.successfulOrders) * 100)
          : 0,
      },
      feeBreakdown: {
        livraison: round(numberOrZero(financial?.livraison)),
        poids: round(numberOrZero(financial?.poids)),
        extra: round(numberOrZero(financial?.extra)),
        sms: round(numberOrZero(financial?.sms)),
        stockage: round(numberOrZero(financial?.stockage)),
        commission: round(numberOrZero(financial?.commission)),
        total: totalFees,
        avgPerOrder: matchedOrders ? round(totalFees / matchedOrders) : 0,
      },
      website,
    } satisfies StatsDashboardData;
  }

  const [tracking, paidAttribution, commerce] = await Promise.all([
    getMetaAdsTrackingData(db, filters),
    getMetaPaidAttributionData(db, filters),
    getMetaCommerceReport(db, filters, false),
  ]);

  return {
    ...dashboard,
    metaAds: {
      events: tracking.eventRows.map((row) => ({
        name: row.name,
        total: row.total,
        pixelFired: row.pixelFired,
        capiSent: row.capiSent,
        capiDelivered: row.capiDelivered,
        capiFailed: row.capiFailed,
        lastOccurredAt: toIsoDateString(row.lastOccurredAt),
      })),
      recentPayloads: tracking.payloadRows.map((row) => ({
        eventId: row.eventId,
        analyticsEventName: row.analyticsEventName,
        metaEventName: row.metaEventName,
        pagePath: row.pagePath,
        occurredAt: toIsoDateString(row.occurredAt) ?? new Date(0).toISOString(),
        pixelPayload: row.pixelPayload,
        capiPayload: row.capiPayload,
        capiStatus: row.capiStatus,
        capiOk: row.capiOk,
      })),
      health: tracking.health,
      paidAttribution,
      commerce,
    },
  } satisfies StatsDashboardData;
}

export async function getLiveStorefrontAnalytics(
  input: StatsFilters,
  options: { includeExperience?: boolean } = {},
) {
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const db = getDb();
  const analyticsWhere = buildAnalyticsWhere(filters);
  const rollupWhere = buildAnalyticsRollupWhere(filters);
  const includeExperience = options.includeExperience !== false;
  const [websiteData, experience, liveOrders] = await Promise.all([
    getWebsiteAnalyticsData(db, analyticsWhere, rollupWhere, filters, false, 'sessions'),
    includeExperience
      ? getExperienceStats(db, filters, { scope: 'storefront' })
      : Promise.resolve(emptyExperienceStats()),
    getLiveOrderAnalytics(db, filters),
  ]);
  const summary = websiteData.websiteSummaryRows[0];
  const website = mergeCanonicalWebsitePurchases(
    {
      sessions: summary?.sessions ?? 0,
      journeys: summary?.journeys ?? 0,
      pageViews: summary?.pageViews ?? 0,
      productViews: summary?.productViews ?? 0,
      addToCarts: summary?.addToCarts ?? 0,
      checkoutStarts: summary?.checkoutStarts ?? 0,
      purchases: 0,
      searches: summary?.searches ?? 0,
      zeroResultSearches: summary?.zeroResultSearches ?? 0,
      sessionConversionRate: 0,
      viewToCartRate: summary?.productViews
        ? round(((summary?.addToCarts ?? 0) / summary.productViews) * 100)
        : 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      topSearches: websiteData.websiteSearchRows.map((row) => ({
        term: row.term,
        searches: row.searches,
        zeroResults: row.zeroResults,
      })),
      funnel: [],
      topProducts: websiteData.websiteTopProductRows.map((row) => ({
        id: String(row.id),
        title: row.title,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        sku: row.sku,
        categoryName: row.categoryName,
        brandName: row.brandName,
        viewCount: row.viewCount,
        addToCartCount: row.addToCartCount,
        checkoutCount: row.checkoutCount,
        websitePurchaseCount: row.websitePurchaseCount,
        popularityScore: round(numberOrZero(row.popularityScore)),
        websiteConversionRate: round(numberOrZero(row.websiteConversionRate) * 100),
      })),
      ...experience.website,
    },
    liveOrders.totalOrders,
    liveOrders.trends.daily,
  );

  return {
    website,
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
  };
}

export async function getStatsDashboard(input: StatsFilters) {
  const snapshot = await readLatestStatsSnapshot(input);
  if (isStatsSnapshotUsable(snapshot)) {
    return withLiveOperationalAnalytics(snapshot, input);
  }

  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `bootstrap-${crypto.randomUUID()}`,
    trigger: 'bootstrap-request',
    data,
  });
  return withLiveOperationalAnalytics(
    readLatestStatsSnapshot(input).then((latest) => latest ?? data),
    input,
  );
}

export function isStatsSnapshotUsable(
  snapshot: StatsDashboardData | null,
): snapshot is StatsDashboardData {
  return Boolean(snapshot && !snapshot.snapshot?.isStale);
}

export async function refreshStatsDashboard(input: StatsFilters, trigger = 'manual-refresh') {
  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `${trigger}-${crypto.randomUUID()}`,
    trigger,
    data,
  });

  return withLiveOperationalAnalytics(
    readLatestStatsSnapshot(input).then((latest) => latest ?? data),
    input,
  );
}

async function getLiveOrderSummary(db: ReturnType<typeof getDb>, filters: Required<StatsFilters>) {
  const result = await db.execute(buildLiveOrderSummaryQuery(filters));
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    totalOrders: numberOrZero(row.total_orders),
    successfulOrders: numberOrZero(row.successful_orders),
  };
}

async function getLiveOrderAnalytics(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
) {
  const [summary, trendResult] = await Promise.all([
    getLiveOrderSummary(db, filters),
    db.execute(buildLiveOrderTrendQuery(filters)),
  ]);
  const trends: Record<
    'daily' | 'weekly' | 'monthly',
    Array<{ bucket: string; orders: number }>
  > = {
    daily: [],
    weekly: [],
    monthly: [],
  };

  for (const row of trendResult.rows as Array<Record<string, unknown>>) {
    const grain = row.grain;
    const bucket = typeof row.bucket === 'string' ? row.bucket : '';
    if ((grain === 'daily' || grain === 'weekly' || grain === 'monthly') && bucket) {
      trends[grain].push({ bucket, orders: numberOrZero(row.orders) });
    }
  }

  return {
    ...summary,
    trends,
  };
}

async function withLiveOperationalAnalytics(
  data: StatsDashboardData | Promise<StatsDashboardData>,
  input: StatsFilters,
) {
  const resolved = await data;
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const db = getDb();
  const [admin, storefront, commerce, liveOrders] = await Promise.all([
    getLiveAdminAiStats(db, filters).catch(() => resolved.aiAssistants.admin),
    getLiveStorefrontAiStats(db, filters).catch(() => resolved.aiAssistants.storefront),
    getMetaCommerceReport(db, filters, false).catch(() => resolved.metaAds.commerce),
    getLiveOrderAnalytics(db, filters).catch(() => null),
  ]);
  const summary = liveOrders
    ? {
        ...resolved.summary,
        totalOrders: liveOrders.totalOrders,
        totalConfirmedOrders: liveOrders.successfulOrders,
        fulfillmentRate: liveOrders.successfulOrders
          ? round((resolved.summary.matchedOrders / liveOrders.successfulOrders) * 100)
          : 0,
      }
    : resolved.summary;
  const trends = liveOrders
    ? {
        ...resolved.trends,
        daily: mergeLiveOrderTrend(resolved.trends.daily, liveOrders.trends.daily),
        weekly: mergeLiveOrderTrend(resolved.trends.weekly, liveOrders.trends.weekly),
        monthly: mergeLiveOrderTrend(resolved.trends.monthly, liveOrders.trends.monthly),
      }
    : resolved.trends;
  const adCosts = liveOrders
    ? {
        ...resolved.adCosts,
        cpa: liveOrders.totalOrders
          ? round(resolved.adCosts.totalSpend / liveOrders.totalOrders)
          : 0,
      }
    : resolved.adCosts;
  return {
    ...resolved,
    summary,
    trends,
    adCosts,
    website: liveOrders
      ? mergeCanonicalWebsitePurchases(
          resolved.website,
          liveOrders.totalOrders,
          liveOrders.trends.daily,
        )
      : resolved.website,
    aiAssistants: { admin, storefront },
    metaAds: { ...resolved.metaAds, commerce },
  };
}

async function writeAdminReportingSnapshot({
  runId,
  trigger,
  sourceImportBatchId = null,
  data,
}: {
  runId: string;
  trigger: string;
  sourceImportBatchId?: string | null;
  data: StatsDashboardData;
}) {
  const db = getDb();
  const filters = buildResolvedFilters(data.filters);
  const now = new Date();
  const staleAt = new Date(now.getTime() + ADMIN_REPORTING_STALE_AFTER_MS);
  await db
    .insert(adminReportingSnapshots)
    .values({
      snapshotKey: getSnapshotKey(filters),
      runId,
      trigger,
      sourceImportBatchId,
      range: filters.range,
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      reportThroughDate: getReportThroughDate(data),
      payload: stripSnapshotMeta(data),
      generatedAt: now,
      staleAt,
    })
    .onConflictDoUpdate({
      target: [adminReportingSnapshots.snapshotKey, adminReportingSnapshots.runId],
      set: {
        trigger,
        sourceImportBatchId,
        range: filters.range,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        reportThroughDate: getReportThroughDate(data),
        payload: stripSnapshotMeta(data),
        generatedAt: now,
        staleAt,
      },
    });
}

export async function refreshAdminReportingSnapshots({
  runId = crypto.randomUUID(),
  trigger,
  sourceImportBatchId = null,
}: {
  runId?: string;
  trigger: string;
  sourceImportBatchId?: string | null;
}) {
  const db = getDb();
  const startedAt = new Date();

  await db
    .insert(adminReportingSnapshotRuns)
    .values({
      runId,
      trigger,
      sourceImportBatchId,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: adminReportingSnapshotRuns.runId,
      set: {
        trigger,
        sourceImportBatchId,
        status: 'running',
        startedAt,
        updatedAt: startedAt,
        errorMessage: null,
      },
    });

  try {
    let built = 0;
    for (const input of ADMIN_REPORTING_STANDARD_INPUTS) {
      const data = await computeStatsDashboard(input);
      await writeAdminReportingSnapshot({
        runId,
        trigger,
        sourceImportBatchId,
        data,
      });
      built += 1;
    }

    const completedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'completed',
        completedAt,
        updatedAt: completedAt,
        errorMessage: null,
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));

    return {
      runId,
      trigger,
      sourceImportBatchId,
      snapshots: built,
    };
  } catch (error) {
    const failedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'failed',
        completedAt: failedAt,
        updatedAt: failedAt,
        errorMessage: error instanceof Error ? error.message : 'Unknown reporting refresh failure',
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));
    throw error;
  }
}
