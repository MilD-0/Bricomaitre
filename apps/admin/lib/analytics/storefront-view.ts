import { getDb } from '@bric/db/client';
import { getLiveStorefrontAnalytics } from '../storefront-analytics';
import {
  loadStorefrontPaths,
  loadStorefrontSessionFunnel,
  storefrontPathCoverage,
} from './commerce-data';
import type { AnalyticsFilters, AnalyticsMetric, AnalyticsQuery } from './contract';
import {
  commonCoverageStart,
  commonCutoff,
  loadCanonicalCutoffs,
  loadDatasetCutoffDate,
  type AnalyticsCanonicalCutoffs,
} from './data-boundaries';
import {
  clampQueryToReference,
  clipAnalyticsFilters,
  inclusiveDays,
  resolveAnalyticsFilters,
  resolveAnalyticsReferenceNow,
} from './date-range';
import { previousFiltersWithCoverage } from './economics-data';
import { type Database, effectiveRange, metric, statsInput } from './loaders-shared';
import { loadSourceHealth } from './source-health';

export async function loadStorefrontView(
  db: Database,
  filters: AnalyticsFilters,
  now: Date,
  cutoffs: AnalyticsCanonicalCutoffs,
  includeDetails = false,
) {
  const storefrontFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const priorFilters = previousFiltersWithCoverage(
    storefrontFilters,
    cutoffs.ordersFrom,
    cutoffs.storefrontFrom,
  );
  const prior = priorFilters ? statsInput(priorFilters.startDate, priorFilters.endDate) : null;
  const pathCoverage = storefrontPathCoverage(storefrontFilters, now);
  const [dashboard, previous, sources, paths, funnel] = await Promise.all([
    getLiveStorefrontAnalytics(
      db,
      statsInput(storefrontFilters.startDate, storefrontFilters.endDate),
      {
        includeExperience: includeDetails,
      },
    ),
    prior
      ? getLiveStorefrontAnalytics(db, prior, { includeExperience: false })
      : Promise.resolve(null),
    loadSourceHealth(db, filters, undefined, cutoffs.orders ?? undefined),
    includeDetails
      ? loadStorefrontPaths(db, storefrontFilters, now)
      : Promise.resolve<Awaited<ReturnType<typeof loadStorefrontPaths>> | null>(null),
    includeDetails && pathCoverage.coverageStartDate <= pathCoverage.coverageEndDate
      ? loadStorefrontSessionFunnel(
          db,
          pathCoverage.coverageStartDate,
          pathCoverage.coverageEndDate,
        )
      : Promise.resolve<Array<{ name: string; value: number }>>([]),
  ]);
  const website = dashboard.website;
  const old = previous?.website;
  const metrics = [
    metric('sessions', website.sessions, old?.sessions ?? null, 'number', 'neutral'),
    metric('engagementRate', null, null, 'percent'),
    metric('purchases', website.purchases, old?.purchases ?? null, 'number'),
    metric(
      'conversionRate',
      website.sessionConversionRate,
      old?.sessionConversionRate ?? null,
      'percent',
    ),
    metric('errorRate', null, null, 'percent', 'down'),
    metric('returningJourneys', null, null, 'number', 'neutral'),
  ];
  const details =
    includeDetails && paths ? storefrontDetails(dashboard, storefrontFilters, paths, funnel) : null;
  const detailMetrics = new Map(details?.metrics.map((item) => [item.key, item]) ?? []);
  return {
    data: {
      kind: 'storefront' as const,
      metrics: metrics.map((item) => detailMetrics.get(item.key) ?? item),
      summary: {
        sessions: website.sessions,
        journeys: website.journeys,
        pageViews: website.pageViews,
        productViews: website.productViews,
        addToCarts: website.addToCarts,
        checkoutStarts: website.checkoutStarts,
        purchases: website.purchases,
        searches: website.searches,
        zeroResultSearches: website.zeroResultSearches,
        engagedSessions: website.engagedSessions,
        returningJourneys: website.returningJourneys,
        errorEvents: website.errorEvents,
      },
      funnel: [],
      funnelRange: {
        startDate: pathCoverage.coverageStartDate,
        endDate: pathCoverage.coverageEndDate,
        isPartial: pathCoverage.coverageIsPartial,
      },
      trend: [],
      searches: website.topSearches,
      productInterest: website.topProducts,
      acquisitionSources: website.acquisitionSources,
      vitals: website.vitals,
      paths: { ...pathCoverage, rows: [] },
      landingPages: {
        summary: dashboard.landingPages.summary,
        pages: dashboard.landingPages.pages.slice(0, 50),
      },
      aiAssistant: {
        opens: dashboard.aiAssistants.storefront.opens,
        messages: dashboard.aiAssistants.storefront.messages,
        resultClicks: dashboard.aiAssistants.storefront.resultClicks,
        influencedOrders: dashboard.aiAssistants.storefront.influencedOrders,
        confirmedOrders: dashboard.aiAssistants.storefront.confirmedOrders,
        paidOrders: dashboard.aiAssistants.storefront.paidOrders,
      },
      ...(details
        ? {
            funnel: details.funnel,
            paths: details.paths,
            trend: details.trend,
            acquisitionSources: details.acquisitionSources,
            vitals: details.vitals,
            landingPages: details.landingPages,
            aiAssistant: details.aiAssistant,
          }
        : {}),
    },
    effectiveRanges: [
      effectiveRange('storefront', storefrontFilters, ['orders', 'storefront']),
      effectiveRange(
        'storefront_funnel',
        {
          ...storefrontFilters,
          startDate: pathCoverage.coverageStartDate,
          endDate: pathCoverage.coverageEndDate,
        },
        ['orders', 'storefront'],
      ),
    ],
    sources,
    warnings: [],
  };
}

export type AnalyticsStorefrontDetails = {
  metrics: AnalyticsMetric[];
  funnel: Array<{ name: string; value: number }>;
  funnelRange: { startDate: string; endDate: string; isPartial: boolean };
  paths: Awaited<ReturnType<typeof loadStorefrontPaths>>;
  trend: Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>['website']['trend'];
  acquisitionSources: Awaited<
    ReturnType<typeof getLiveStorefrontAnalytics>
  >['website']['acquisitionSources'];
  vitals: Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>['website']['vitals'];
  landingPages: {
    summary: Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>['landingPages']['summary'];
    pages: Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>['landingPages']['pages'];
  };
  aiAssistant: Pick<
    Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>['aiAssistants']['storefront'],
    'opens' | 'messages' | 'resultClicks' | 'influencedOrders' | 'confirmedOrders' | 'paidOrders'
  >;
};

function storefrontDetails(
  dashboard: Awaited<ReturnType<typeof getLiveStorefrontAnalytics>>,
  filters: AnalyticsFilters,
  paths: Awaited<ReturnType<typeof loadStorefrontPaths>>,
  funnel: Array<{ name: string; value: number }>,
): AnalyticsStorefrontDetails {
  const rawExperienceCovered =
    filters.startDate != null && inclusiveDays(filters.startDate, filters.endDate) <= 7;
  return {
    metrics: [
      metric(
        'engagementRate',
        rawExperienceCovered ? dashboard.website.engagementRate : null,
        null,
        'percent',
      ),
      metric(
        'errorRate',
        rawExperienceCovered ? dashboard.website.errorRate : null,
        null,
        'percent',
        'down',
      ),
      metric(
        'returningJourneys',
        rawExperienceCovered ? dashboard.website.returningJourneys : null,
        null,
        'number',
        'neutral',
      ),
    ],
    funnel,
    funnelRange: {
      startDate: paths.coverageStartDate,
      endDate: paths.coverageEndDate,
      isPartial: paths.coverageIsPartial,
    },
    paths,
    trend: dashboard.website.trend,
    acquisitionSources: dashboard.website.acquisitionSources,
    vitals: dashboard.website.vitals,
    landingPages: {
      summary: dashboard.landingPages.summary,
      pages: dashboard.landingPages.pages.slice(0, 50),
    },
    aiAssistant: {
      opens: dashboard.aiAssistants.storefront.opens,
      messages: dashboard.aiAssistants.storefront.messages,
      resultClicks: dashboard.aiAssistants.storefront.resultClicks,
      influencedOrders: dashboard.aiAssistants.storefront.influencedOrders,
      confirmedOrders: dashboard.aiAssistants.storefront.confirmedOrders,
      paidOrders: dashboard.aiAssistants.storefront.paidOrders,
    },
  };
}

export async function getAnalyticsStorefrontDetails(
  query: AnalyticsQuery,
  options: { db?: Database; now?: Date } = {},
) {
  const db = options.db ?? getDb();
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoffDate = reviewSetting ? await loadDatasetCutoffDate(db) : null;
  const clock = resolveAnalyticsReferenceNow(reviewSetting, cutoffDate, wallNow);
  const effectiveQuery = clock.reviewClock
    ? clampQueryToReference({ ...query, view: 'storefront' }, clock.referenceDate)
    : { ...query, view: 'storefront' as const };
  const filters = resolveAnalyticsFilters(effectiveQuery, clock.now);
  const cutoffs = await loadCanonicalCutoffs(db);
  const storefrontFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const pathCoverage = storefrontPathCoverage(storefrontFilters, clock.now);
  const [dashboard, paths, funnel] = await Promise.all([
    getLiveStorefrontAnalytics(
      db,
      statsInput(storefrontFilters.startDate, storefrontFilters.endDate),
    ),
    loadStorefrontPaths(db, storefrontFilters, clock.now),
    pathCoverage.coverageStartDate <= pathCoverage.coverageEndDate
      ? loadStorefrontSessionFunnel(
          db,
          pathCoverage.coverageStartDate,
          pathCoverage.coverageEndDate,
        )
      : Promise.resolve([]),
  ]);
  return {
    data: storefrontDetails(dashboard, storefrontFilters, paths, funnel),
    generatedAt: clock.now.toISOString(),
  };
}
