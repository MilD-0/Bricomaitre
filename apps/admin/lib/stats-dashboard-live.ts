import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsEvents,
  analyticsSessions,
  processedOrders,
} from '@bric/db/schema';
import { getMetaCommerceReport } from './meta-commerce-analytics';
import { type StatsDashboardData, type StatsFilters, statsQuerySchema } from './stats-contract';
import { emptyDashboard, optionalAnalyticsDiagnostic } from './stats-dashboard-foundation';
import {
  emptyExperienceStats,
  getExperienceStats,
  getLiveAdminAiStats,
  getLiveStorefrontAiStats,
} from './stats-experience';
import {
  buildAnalyticsRollupWhere,
  buildAnalyticsWhere,
  buildLiveOrderSummaryQuery,
  buildLiveOrderTrendQuery,
  buildResolvedFilters,
  buildStatsWhere,
  getMetaAdsTrackingData,
  getMetaPaidAttributionData,
  getWebsiteAnalyticsData,
  mergeCanonicalWebsitePurchases,
  mergeLiveOrderTrend,
  toIsoDateString,
} from './stats-live-sources';
import { numberOrZero, round } from './stats-values';

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

  const [trackingResult, paidAttribution, commerce] = await Promise.all([
    optionalAnalyticsDiagnostic(getMetaAdsTrackingData(db, filters)),
    getMetaPaidAttributionData(db, filters),
    getMetaCommerceReport(db, filters, false),
  ]);

  return {
    ...dashboard,
    metaAds: {
      trackingAvailable: trackingResult.available,
      events: (trackingResult.data?.eventRows ?? []).map((row) => ({
        name: row.name,
        total: row.total,
        pixelFired: row.pixelFired,
        capiSent: row.capiSent,
        capiDelivered: row.capiDelivered,
        capiFailed: row.capiFailed,
        lastOccurredAt: toIsoDateString(row.lastOccurredAt),
      })),
      recentPayloads: (trackingResult.data?.payloadRows ?? []).map((row) => ({
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
      health: trackingResult.data?.health,
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

export async function getLiveOrderSummary(
  db: ReturnType<typeof getDb>,
  filters: Required<StatsFilters>,
) {
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

export async function withLiveOperationalAnalytics(
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
