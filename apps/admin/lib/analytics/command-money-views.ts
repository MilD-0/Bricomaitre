import { getProfitTrackerSettings } from '../profit-tracker';
import { loadStorefrontOrderConversion } from './commerce-data';
import { cohortCompletionCovers, loadCohortCompletionPair } from './cohort-completion';
import type { AnalyticsFilters } from './contract';
import {
  commonCoverageStart,
  commonCutoff,
  type AnalyticsCanonicalCutoffs,
} from './data-boundaries';
import { addDays, clipAnalyticsFilters } from './date-range';
import { aggregateAutomaticPaidSeries, aggregateEconomicsSeries } from './economics-series';
import {
  buildSignals,
  economicsMetrics,
  economicsWarnings,
  loadEconomicsPair,
  previousFiltersWithCoverage,
  sourceWarnings,
} from './economics-data';
import { appendEconomicsForecastSeries, buildEconomicsForecast } from './forecast';
import {
  loadAutomaticPaidEconomics,
  loadCashPipeline,
  loadFulfillmentCohorts,
  loadFulfillmentSummary,
  loadLeadingOrderForecast,
  loadReturnObservation,
  withLeadingCashStages,
} from './fulfillment-data';
import {
  type Database,
  effectiveRange,
  metric,
  metricWithProjectedComparison,
} from './loaders-shared';
import { loadSourceHealth } from './source-health';

export async function loadCommandView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const economicsFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.meta),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.metaFrom),
  );
  const fulfillmentFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const storefrontFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const priorFulfillment = previousFiltersWithCoverage(
    fulfillmentFilters,
    cutoffs.postedFrom,
    cutoffs.ecotrackFrom,
  );
  const priorPaid = previousFiltersWithCoverage(fulfillmentFilters, cutoffs.paidFrom);
  const priorStorefront = previousFiltersWithCoverage(
    storefrontFilters,
    cutoffs.ordersFrom,
    cutoffs.storefrontFrom,
  );
  const settingsPromise = getProfitTrackerSettings(db);
  const [
    economicsPair,
    overview,
    previousOverview,
    fulfillment,
    previousFulfillment,
    automaticPaid,
    previousAutomaticPaid,
    cashPipeline,
    leadingForecast,
    fulfillmentCompletion,
  ] = await Promise.all([
    loadEconomicsPair(db, economicsFilters, cutoffs.postedFrom, cutoffs.metaFrom),
    loadStorefrontOrderConversion(db, storefrontFilters),
    priorStorefront ? loadStorefrontOrderConversion(db, priorStorefront) : Promise.resolve(null),
    loadFulfillmentSummary(db, fulfillmentFilters.startDate, fulfillmentFilters.endDate),
    priorFulfillment
      ? loadFulfillmentSummary(db, priorFulfillment.startDate, priorFulfillment.endDate)
      : Promise.resolve(null),
    settingsPromise.then((settings) =>
      loadAutomaticPaidEconomics(db, fulfillmentFilters, settings.defaultReturnRate === 100),
    ),
    priorPaid
      ? settingsPromise.then((settings) =>
          loadAutomaticPaidEconomics(db, priorPaid, settings.defaultReturnRate === 100),
        )
      : Promise.resolve(null),
    loadCashPipeline(db, fulfillmentFilters),
    settingsPromise.then((settings) => loadLeadingOrderForecast(db, fulfillmentFilters, settings)),
    settingsPromise.then((settings) =>
      loadCohortCompletionPair(db, fulfillmentFilters, 1 - settings.defaultReturnRate / 100),
    ),
  ]);
  const { current, previous } = economicsPair;
  const [returns, sources] = await Promise.all([
    loadReturnObservation(db, fulfillmentFilters, current.settings.defaultReturnRate),
    loadSourceHealth(db, filters, current),
  ]);
  const forecast = buildEconomicsForecast(current, economicsFilters.endDate, 14, leadingForecast);
  const forecastTrueProfitDzd = forecast
    .slice(0, 7)
    .reduce((sum, point) => sum + point.forecastTrueProfitDzd, 0);
  const paidByBucket = new Map(
    aggregateAutomaticPaidSeries(
      automaticPaid,
      filters.resolvedGrain,
      fulfillmentFilters.endDate,
    ).map((row) => [row.bucket, row.profitDzd]),
  );
  const completionComparisonAvailable = Boolean(
    fulfillmentCompletion?.previous &&
    previousFulfillment &&
    cohortCompletionCovers(fulfillment.postedOrders, fulfillmentCompletion.current) &&
    cohortCompletionCovers(previousFulfillment.postedOrders, fulfillmentCompletion.previous),
  );

  return {
    data: {
      kind: 'command' as const,
      metrics: [
        ...economicsMetrics(current, previous).slice(0, 2),
        metric(
          'automaticPaidProfit',
          automaticPaid.summary.profitDzd,
          previousAutomaticPaid?.summary.profitDzd ?? null,
          'dzd',
        ),
        metric(
          'postedOrders',
          fulfillment.postedOrders,
          previousFulfillment?.postedOrders ?? null,
          'number',
          'neutral',
        ),
        metricWithProjectedComparison(
          'paidOrders',
          fulfillment.paidOrders,
          previousFulfillment?.paidOrders ?? null,
          'number',
          {
            value: completionComparisonAvailable
              ? (fulfillmentCompletion?.current.projectedPaidOrders ?? null)
              : null,
            previous: completionComparisonAvailable
              ? (fulfillmentCompletion?.previous?.projectedPaidOrders ?? null)
              : null,
          },
        ),
        metric(
          'storefrontConversion',
          overview.conversionRatePct,
          previousOverview?.conversionRatePct ?? null,
          'percent',
        ),
      ],
      economics: {
        summary: current.summary,
        realized: current.realized.summary,
        coverage: current.coverage,
        automaticPaid,
      },
      trajectory: appendEconomicsForecastSeries(
        aggregateEconomicsSeries(current, filters.resolvedGrain, economicsFilters.endDate),
        forecast,
        filters.resolvedGrain,
      ).map((point) => ({
        ...point,
        automaticPaidProfitDzd: paidByBucket.get(point.bucket) ?? null,
      })),
      fulfillment: {
        summary: fulfillment,
        cashPipeline: withLeadingCashStages(cashPipeline, leadingForecast),
        funnel: [
          { key: 'submitted', value: fulfillment.submittedOrders },
          { key: 'confirmed', value: fulfillment.confirmedOrders },
          { key: 'posted', value: fulfillment.postedOrders },
          { key: 'delivered', value: fulfillment.deliveredOrders },
          { key: 'paid', value: fulfillment.paidOrders },
        ],
      },
      returns,
      forecast: {
        days: forecast.slice(0, 7),
        nextSevenDayTrueProfitDzd: forecastTrueProfitDzd,
        leading: leadingForecast,
      },
      signals: buildSignals(current, returns, fulfillment),
    },
    effectiveRanges: [
      effectiveRange('economics', economicsFilters, ['orders', 'meta', 'assumptions']),
      effectiveRange('fulfillment', fulfillmentFilters, ['orders', 'ecotrack']),
      effectiveRange('storefront', storefrontFilters, ['orders', 'storefront']),
    ],
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}

export async function loadMoneyView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const economicsFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.meta),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.metaFrom),
  );
  const fulfillmentFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const priorFulfillment = previousFiltersWithCoverage(
    fulfillmentFilters,
    cutoffs.postedFrom,
    cutoffs.ecotrackFrom,
    cutoffs.paidFrom,
  );
  const { current, previous } = await loadEconomicsPair(
    db,
    economicsFilters,
    cutoffs.postedFrom,
    cutoffs.metaFrom,
  );
  const [sources, automaticPaid, previousAutomaticPaid, cohorts, leadingForecast] =
    await Promise.all([
      loadSourceHealth(db, filters, current),
      loadAutomaticPaidEconomics(
        db,
        fulfillmentFilters,
        current.settings.defaultReturnRate === 100,
      ),
      priorFulfillment
        ? loadAutomaticPaidEconomics(
            db,
            priorFulfillment,
            current.settings.defaultReturnRate === 100,
          )
        : Promise.resolve(null),
      loadFulfillmentCohorts(db, fulfillmentFilters.startDate, fulfillmentFilters.endDate, current),
      loadLeadingOrderForecast(db, economicsFilters, current.settings),
    ]);
  const forecast = buildEconomicsForecast(current, economicsFilters.endDate, 14, leadingForecast);
  const headlineMetrics = economicsMetrics(current, previous);
  const performanceSeries = appendEconomicsForecastSeries(
    aggregateEconomicsSeries(current, filters.resolvedGrain, economicsFilters.endDate),
    forecast,
    filters.resolvedGrain,
  );
  return {
    data: {
      kind: 'money' as const,
      metrics: [
        ...headlineMetrics.slice(0, 4),
        metric(
          'automaticPaidProfit',
          automaticPaid.summary.profitDzd,
          previousAutomaticPaid?.summary.profitDzd ?? null,
          'dzd',
        ),
        headlineMetrics[4],
        metric('paidProfitCoverage', automaticPaid.summary.profitCoveragePct, null, 'percent'),
      ],
      series: performanceSeries.filter((point) => !point.isForecast),
      performanceSeries,
      automaticPaid,
      coverage: current.coverage,
      paidSeries: aggregateAutomaticPaidSeries(
        automaticPaid,
        filters.resolvedGrain,
        fulfillmentFilters.endDate,
      ),
      cohorts,
      forecast,
      weeks: current.weeks.map((week) => ({
        ...week,
        isPartial: economicsFilters.endDate < addDays(week.weekStart, 6),
      })),
    },
    effectiveRanges: [
      effectiveRange('economics', economicsFilters, ['orders', 'meta', 'assumptions']),
      effectiveRange('paid', fulfillmentFilters, ['orders', 'ecotrack']),
    ],
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}
