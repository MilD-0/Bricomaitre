import { getDb } from '@bric/db/client';

import {
  loadAcquisitionView,
  loadFulfillmentView,
} from './analytics/acquisition-fulfillment-views';
import { loadAssumptionsView, loadSearchView } from './analytics/assumptions-search-views';
import { loadCatalogView } from './analytics/catalog-view';
import { loadCommandView, loadMoneyView } from './analytics/command-money-views';
import type {
  AnalyticsEffectiveRange,
  AnalyticsFilters,
  AnalyticsQuery,
  AnalyticsSource,
  AnalyticsView,
} from './analytics/contract';
import { loadCanonicalCutoffs, loadDatasetCutoffDate } from './analytics/data-boundaries';
import {
  clampQueryToReference,
  resolveAnalyticsFilters,
  resolveAnalyticsReferenceNow,
} from './analytics/date-range';
import type { Database } from './analytics/loaders-shared';
import { loadStorefrontView } from './analytics/storefront-view';

export { analyticsQuerySchema } from './analytics/contract';
export type {
  AnalyticsCashStage,
  AnalyticsEffectiveRange,
  AnalyticsEntityLevel,
  AnalyticsFilters,
  AnalyticsGrain,
  AnalyticsMetric,
  AnalyticsQuery,
  AnalyticsRange,
  AnalyticsResolvedGrain,
  AnalyticsSource,
  AnalyticsView,
} from './analytics/contract';
export {
  clipAnalyticsFilters,
  resolveAnalyticsFilters,
  resolveAnalyticsReferenceNow,
} from './analytics/date-range';
export {
  aggregateAutomaticPaidSeries,
  aggregateEconomicsSeries,
} from './analytics/economics-series';
export { economicsSummaryMetrics, materializedFactsAreUsable } from './analytics/economics-data';
export {
  buildEconomicsForecast,
  buildLeadingOrderForecast,
  projectOpenEconomicsSeries,
} from './analytics/forecast';
export { loadAutomaticPaidEconomics } from './analytics/fulfillment-data';
export { metricChange } from './analytics/metrics';
export { freshnessState } from './analytics/source-health';
export { storefrontPathCoverage } from './analytics/commerce-data';
export { finalizeSearchFilters } from './analytics/assumptions-search-views';
export { getAnalyticsStorefrontDetails } from './analytics/storefront-view';

type LoadedAnalyticsSection =
  | Awaited<ReturnType<typeof loadCommandView>>
  | Awaited<ReturnType<typeof loadMoneyView>>
  | Awaited<ReturnType<typeof loadAcquisitionView>>
  | Awaited<ReturnType<typeof loadFulfillmentView>>
  | Awaited<ReturnType<typeof loadStorefrontView>>
  | Awaited<ReturnType<typeof loadSearchView>>
  | Awaited<ReturnType<typeof loadCatalogView>>
  | Awaited<ReturnType<typeof loadAssumptionsView>>;

export type AnalyticsPayload = {
  view: AnalyticsView;
  filters: AnalyticsFilters;
  generatedAt: string;
  referenceDate: string;
  reviewClock: boolean;
  data: LoadedAnalyticsSection['data'];
  effectiveRanges: AnalyticsEffectiveRange[];
  sources: AnalyticsSource[];
  warnings: LoadedAnalyticsSection['warnings'];
  diagnostics: {
    queryDurationMs: number;
    responseSizeBytes: number;
  };
};

export async function getAnalyticsData(
  query: AnalyticsQuery,
  options: { db?: Database; now?: Date; includeStorefrontDetails?: boolean } = {},
): Promise<AnalyticsPayload> {
  const startedAt = performance.now();
  const db = options.db ?? getDb();
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoffDate = reviewSetting ? await loadDatasetCutoffDate(db) : null;
  const clock = resolveAnalyticsReferenceNow(reviewSetting, cutoffDate, wallNow);
  const now = clock.now;
  const effectiveQuery = clock.reviewClock
    ? clampQueryToReference(query, clock.referenceDate)
    : query;
  const filters = resolveAnalyticsFilters(effectiveQuery, now);
  const cutoffs = filters.view === 'search' ? null : await loadCanonicalCutoffs(db);
  let loaded: LoadedAnalyticsSection;

  switch (filters.view) {
    case 'money':
      loaded = await loadMoneyView(db, filters, cutoffs!);
      break;
    case 'acquisition':
      loaded = await loadAcquisitionView(db, filters, cutoffs!);
      break;
    case 'fulfillment':
      loaded = await loadFulfillmentView(db, filters, cutoffs!);
      break;
    case 'storefront':
      loaded = await loadStorefrontView(
        db,
        filters,
        now,
        cutoffs!,
        options.includeStorefrontDetails,
      );
      break;
    case 'search':
      loaded = await loadSearchView(db, filters);
      break;
    case 'catalog':
      loaded = await loadCatalogView(db, filters, cutoffs!);
      break;
    case 'assumptions':
      loaded = await loadAssumptionsView(db, filters, cutoffs!);
      break;
    case 'command':
      loaded = await loadCommandView(db, filters, cutoffs!);
      break;
  }

  const base = {
    view: filters.view,
    filters,
    generatedAt: now.toISOString(),
    referenceDate: clock.referenceDate,
    reviewClock: clock.reviewClock,
    data: loaded.data,
    effectiveRanges: loaded.effectiveRanges,
    sources: clock.reviewClock
      ? loaded.sources.map((source: AnalyticsSource) => ({
          ...source,
          state:
            source.state === 'manual' || source.state === 'missing'
              ? source.state
              : ('current' as const),
        }))
      : loaded.sources,
    warnings: clock.reviewClock
      ? loaded.warnings.filter((warning) => warning.key !== 'sourcePartial')
      : loaded.warnings,
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  } satisfies AnalyticsPayload;
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
