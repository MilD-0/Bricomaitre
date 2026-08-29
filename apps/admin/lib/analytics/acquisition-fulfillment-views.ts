import { getProfitTrackerReport } from '../profit-tracker';
import { getStatsDashboardSection } from '../stats';
import { loadMetaBreakdowns, loadMetaPerformance, publicMetaEntity } from './acquisition-data';
import type { AnalyticsFilters } from './contract';
import {
  commonCoverageStart,
  commonCutoff,
  type AnalyticsCanonicalCutoffs,
} from './data-boundaries';
import { clipAnalyticsFilters, inclusiveDays } from './date-range';
import { aggregateEconomicsSeries } from './economics-series';
import {
  economicsWarnings,
  loadEconomicsPair,
  loadMaterializedEconomicsReport,
  previousFiltersWithCoverage,
  sourceWarnings,
} from './economics-data';
import { buildEconomicsForecast, projectOpenEconomicsSeries } from './forecast';
import {
  loadFulfillmentData,
  loadFulfillmentSummary,
  loadLeadingOrderForecast,
  loadReturnObservation,
} from './fulfillment-data';
import {
  type Database,
  economicsInput,
  effectiveRange,
  metric,
  statsInput,
} from './loaders-shared';
import { ratio } from './metrics';
import { loadSourceHealth } from './source-health';

export async function loadAcquisitionView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const performanceFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.meta, cutoffs.orders, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.metaFrom, cutoffs.ordersFrom, cutoffs.ecotrackFrom),
  );
  const prior = previousFiltersWithCoverage(
    performanceFilters,
    cutoffs.metaFrom,
    cutoffs.ordersFrom,
    cutoffs.ecotrackFrom,
  );
  const { current, previous } = await loadEconomicsPair(
    db,
    performanceFilters,
    cutoffs.postedFrom,
    cutoffs.metaFrom,
  );
  const [performance, previousPerformance, diagnostics, sources, breakdowns, leadingForecast] =
    await Promise.all([
      loadMetaPerformance(db, performanceFilters, current),
      prior && previous ? loadMetaPerformance(db, prior, previous) : Promise.resolve(null),
      getStatsDashboardSection(
        statsInput(performanceFilters.startDate, performanceFilters.endDate),
        'metaAds',
      ),
      loadSourceHealth(db, filters, current),
      loadMetaBreakdowns(db, performanceFilters, current),
      loadLeadingOrderForecast(db, performanceFilters, current.settings),
    ]);
  const summary = performance.summary;
  const old = previousPerformance?.summary;
  const forecast = buildEconomicsForecast(current, performanceFilters.endDate, 14, leadingForecast);
  const profitSeries = projectOpenEconomicsSeries(
    aggregateEconomicsSeries(current, filters.resolvedGrain, performanceFilters.endDate),
    forecast,
    filters.resolvedGrain,
  );
  return {
    data: {
      kind: 'acquisition' as const,
      metrics: [
        metric('adCost', summary.adCostDzd, old?.adCostDzd ?? null, 'dzd', 'neutral'),
        metric('profitX', current.summary.profitX, previous?.summary.profitX ?? null, 'ratio'),
        metric('impressions', summary.impressions, old?.impressions ?? null, 'number', 'neutral'),
        metric(
          'outboundClicks',
          summary.outboundClicks,
          old?.outboundClicks ?? null,
          'number',
          'neutral',
        ),
        metric('postedOrders', summary.postedOrders, old?.postedOrders ?? null, 'number'),
        metric(
          'costPerPosted',
          summary.costPerPostedDzd,
          old?.costPerPostedDzd ?? null,
          'dzd',
          'down',
        ),
        metric(
          'costPerDelivered',
          summary.costPerDeliveredDzd,
          old?.costPerDeliveredDzd ?? null,
          'dzd',
          'down',
        ),
      ],
      summary,
      coverage: current.coverage,
      entities: {
        campaigns: performance.entities.campaigns.map(publicMetaEntity),
        adsets: performance.entities.adsets.map(publicMetaEntity),
        ads: performance.entities.ads.map(publicMetaEntity),
      },
      entityDaily: performance.daily,
      breakdowns: { maturation: breakdowns.maturation },
      daily: performance.summaryDaily.map((day) => ({
        day: day.day,
        cpmEur: day.cpmEur,
        outboundCtrPct: day.outboundCtrPct,
      })),
      profitSeries: profitSeries.map((point) => ({
        bucket: point.bucket,
        profitX: point.profitX,
        profitXBeforeReturns: point.profitXBeforeReturns,
        profitXProjected: point.profitXProjected,
        profitXBeforeReturnsProjected: point.profitXBeforeReturnsProjected,
        isPartial: point.isPartial,
      })),
      funnel: [
        { key: 'impressions', value: summary.impressions },
        { key: 'outboundClicks', value: summary.outboundClicks },
        { key: 'landingViews', value: summary.landingPageViews },
        { key: 'bricOrders', value: summary.bricOrders },
        { key: 'confirmed', value: summary.confirmedOrders },
        { key: 'posted', value: summary.postedOrders },
        { key: 'paid', value: summary.paidOrders },
      ],
      efficiency: {
        confirmationRatePct: ratio(summary.confirmedOrders, summary.bricOrders),
        clickToPageRatePct: ratio(summary.landingPageViews, summary.outboundClicks),
        exactAdAttributionCoveragePct: ratio(
          summary.bricOrders,
          diagnostics.metaAds.paidAttribution.createdOrders,
        ),
        outcomeMaturityPct: ratio(summary.paidOrders + summary.returnedOrders, summary.bricOrders),
        metaToBricPurchaseDelta: summary.metaPurchases - summary.bricOrders,
      },
      trackingHealth: {
        available: diagnostics.metaAds.trackingAvailable !== false,
        events: diagnostics.metaAds.events,
      },
      sync: {
        canSyncActiveRange:
          filters.startDate != null && inclusiveDays(filters.startDate, filters.endDate) <= 90,
        maxDays: 90,
      },
    },
    effectiveRanges: [
      effectiveRange('acquisition', performanceFilters, [
        'orders',
        'ecotrack',
        'meta',
        'assumptions',
      ]),
    ],
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}

export async function loadFulfillmentView(
  db: Database,
  filters: AnalyticsFilters,
  cutoffs: AnalyticsCanonicalCutoffs,
) {
  const operationalFilters = clipAnalyticsFilters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const prior = previousFiltersWithCoverage(
    operationalFilters,
    cutoffs.postedFrom,
    cutoffs.ecotrackFrom,
  );
  const economics =
    (await loadMaterializedEconomicsReport(db, operationalFilters)) ??
    (await getProfitTrackerReport(
      economicsInput(operationalFilters.startDate, operationalFilters.endDate),
      { db },
    ));
  const [fulfillment, previousSummary] = await Promise.all([
    loadFulfillmentData(db, operationalFilters, economics),
    prior ? loadFulfillmentSummary(db, prior.startDate, prior.endDate) : Promise.resolve(null),
  ]);
  const [returns, sources] = await Promise.all([
    loadReturnObservation(db, operationalFilters, economics.settings.defaultReturnRate),
    loadSourceHealth(db, filters, economics),
  ]);
  return {
    data: {
      kind: 'fulfillment' as const,
      metrics: [
        metric(
          'postedOrders',
          fulfillment.summary.postedOrders,
          previousSummary?.postedOrders ?? null,
          'number',
        ),
        metric(
          'activeShipments',
          fulfillment.summary.activeShipments,
          previousSummary?.activeShipments ?? null,
          'number',
          'neutral',
        ),
        metric(
          'paidOrders',
          fulfillment.summary.paidOrders,
          previousSummary?.paidOrders ?? null,
          'number',
        ),
      ],
      ...fulfillment,
      returns,
      planningReturnRatePct: economics.settings.defaultReturnRate,
    },
    effectiveRanges: [effectiveRange('fulfillment', operationalFilters, ['orders', 'ecotrack'])],
    sources,
    warnings: [...sourceWarnings(sources)],
  };
}
