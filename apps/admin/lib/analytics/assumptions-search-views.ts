import { getProfitTrackerReport } from '../profit-tracker';
import { loadSearchAnalytics, loadSearchThroughDate } from '../analytics-search';
import type { AnalyticsFilters, AnalyticsSource } from './contract';
import {
  commonCoverageStart,
  commonCutoff,
  type AnalyticsCanonicalCutoffs,
} from './data-boundaries';
import { addDays, clipAnalyticsFilters, inclusiveDays } from './date-range';
import { economicsWarnings, sourceWarnings } from './economics-data';
import { loadReturnObservation } from './fulfillment-data';
import {
  type Database,
  type EconomicsReport,
  economicsInput,
  effectiveRange,
  metric,
} from './loaders-shared';
import { loadSourceHealth } from './source-health';

function costIsActiveOn(cost: EconomicsReport['costs'][number], date: string) {
  return cost.startDate <= date && (!cost.endDate || cost.endDate >= date);
}

export async function loadAssumptionsView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const economicsFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.meta),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.metaFrom),
  );
  const economics = await getProfitTrackerReport(
    economicsInput(economicsFilters.startDate, economicsFilters.endDate),
    { db },
  );
  const [returns, sources] = await Promise.all([
    loadReturnObservation(db, economicsFilters, economics.settings.defaultReturnRate),
    loadSourceHealth(db, filters, economics),
  ]);
  const activeMonthlyBurnDzd = economics.costs
    .filter((cost) => cost.period === 'monthly' && costIsActiveOn(cost, economicsFilters.endDate))
    .reduce((sum, cost) => sum + cost.amountDzd, 0);
  const oneTimeCostsDzd = economics.costs
    .filter(
      (cost) =>
        cost.period === 'once' &&
        (!economicsFilters.startDate || cost.startDate >= economicsFilters.startDate) &&
        cost.startDate <= economicsFilters.endDate,
    )
    .reduce((sum, cost) => sum + cost.amountDzd, 0);
  return {
    data: {
      kind: 'assumptions' as const,
      metrics: [
        metric('activeMonthlyBurn', activeMonthlyBurnDzd, null, 'dzd'),
        metric('periodOperatingCost', economics.summary.operatingCostDzd, null, 'dzd'),
        metric(
          'manualOverrideDays',
          sources.find((source) => source.key === 'assumptions')?.records ?? 0,
          null,
          'number',
        ),
        metric('projectedCoverage', economics.coverage.projectedCoveragePct, null, 'percent'),
      ],
      settings: economics.settings,
      returns,
      costs: economics.costs,
      costSummary: {
        activeMonthlyBurnDzd,
        periodOperatingCostDzd: economics.summary.operatingCostDzd,
        oneTimeCostsDzd,
      },
      days: economics.days,
      formula: {
        adCost: 'metaSpendEur * fxRateUsed',
        adjustedProfit:
          'realizedEligibleProfitDzd + unresolvedProfitDzd * (1 - returnRatePct / 100)',
        netProfit: 'adjustedProfitDzd - adCostDzd',
        profitX: 'adjustedProfitDzd / adCostDzd',
        trueProfit: 'netProfitDzd - operatingCostDzd',
      },
    },
    effectiveRanges: [
      effectiveRange('assumptions', economicsFilters, ['orders', 'meta', 'assumptions']),
    ],
    sources,
    warnings: [...economicsWarnings(economics), ...sourceWarnings(sources)],
  };
}

export function finalizeSearchFilters(
  filters: AnalyticsFilters,
  availableThroughDate: string | null,
): AnalyticsFilters {
  const finalizedEndDate =
    availableThroughDate && availableThroughDate < filters.endDate
      ? availableThroughDate
      : filters.endDate;
  const hasFinalizedWindow = !filters.startDate || filters.startDate <= finalizedEndDate;
  const finalizedDays =
    filters.startDate && hasFinalizedWindow
      ? inclusiveDays(filters.startDate, finalizedEndDate)
      : null;
  const finalizedComparisonEndDate =
    filters.startDate && hasFinalizedWindow ? addDays(filters.startDate, -1) : null;
  const finalizedComparisonStartDate =
    finalizedDays && finalizedComparisonEndDate
      ? addDays(finalizedComparisonEndDate, -(finalizedDays - 1))
      : null;
  return {
    ...filters,
    endDate: finalizedEndDate,
    comparisonStartDate: finalizedComparisonStartDate,
    comparisonEndDate: finalizedComparisonEndDate,
  };
}

export async function loadSearchView(db: Database, filters: AnalyticsFilters) {
  const availableThroughDate = await loadSearchThroughDate(db, filters.endDate);
  const searchFilters = finalizeSearchFilters(filters, availableThroughDate);
  const search = await loadSearchAnalytics(db, searchFilters);
  const previous = search.metrics.previous;
  const throughDate = search.source.throughDate;
  const lagDays = throughDate
    ? Math.max(0, inclusiveDays(throughDate.slice(0, 10), filters.endDate) - 1)
    : null;
  const source: AnalyticsSource = {
    key: 'searchConsole',
    state:
      lagDays == null ? 'missing' : lagDays <= 4 ? 'current' : lagDays <= 7 ? 'lagged' : 'partial',
    updatedAt: search.source.updatedAt,
    throughDate,
    records: search.source.records,
    coveragePct: throughDate ? 100 : null,
  };
  const warnings: Array<{ key: string; source?: AnalyticsSource['key']; value?: number | null }> =
    [];
  if (source.state === 'missing' || source.state === 'partial') {
    warnings.push({
      key: source.state === 'missing' ? 'sourceMissing' : 'sourcePartial',
      source: source.key,
      value: source.coveragePct,
    });
  }
  if (
    search.discovery.queryClickCoveragePct != null &&
    search.discovery.queryClickCoveragePct < 99.5
  ) {
    warnings.push({
      key: 'searchDetailCoverage',
      source: 'searchConsole',
      value: search.discovery.queryClickCoveragePct,
    });
  }
  return {
    data: {
      kind: 'search' as const,
      metrics: [
        metric('searchClicks', search.metrics.clicks, previous?.clicks ?? null, 'number'),
        metric(
          'searchImpressions',
          search.metrics.impressions,
          previous?.impressions ?? null,
          'number',
        ),
        metric('searchCtr', search.metrics.ctrPct, previous?.ctrPct ?? null, 'percent'),
        metric(
          'averagePosition',
          search.metrics.position,
          previous?.position ?? null,
          'number',
          'down',
        ),
      ],
      trend: search.trend,
      opportunities: search.opportunities,
      pages: search.pages,
      devices: search.devices,
      countries: search.countries,
      appearances: search.appearances,
      discovery: search.discovery,
      indexHealth: search.indexHealth,
    },
    effectiveRanges: [
      effectiveRange(
        'search',
        {
          ...searchFilters,
          startDate: search.source.fromDate ?? searchFilters.startDate,
        },
        ['searchConsole'],
      ),
    ],
    sources: [source],
    warnings,
  };
}
