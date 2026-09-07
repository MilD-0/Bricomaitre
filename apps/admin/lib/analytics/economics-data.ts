import { sql } from 'drizzle-orm';

import {
  analyticsEconomicsDailyFacts,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  orderLineItems,
  orders,
  orderStatusHistory,
  profitTrackerDays,
  profitTrackerOperatingCosts,
  profitTrackerSettings,
  processedOrders,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  loadProfitTrackerReportForRange,
  getProfitTrackerSettings,
  listProfitTrackerCosts,
} from '../profit-tracker';
import {
  buildProfitTrackerWeeks,
  summarizeProfitTracker,
  type ProfitTrackerSummary,
} from '../profit-tracker-metrics';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  analyticsCalculatorDaySchema,
} from '../analytics-fact-contract';
import type { AnalyticsFilters, AnalyticsMetric, AnalyticsSource } from './contract';
import { addDays, inclusiveDays } from './date-range';
import { datePredicate, timestampPredicate, isoValue, numeric } from './query-values';
import {
  type AnalyticsFulfillmentSummary,
  type AnalyticsReturnObservation,
  type Database,
  type EconomicsReport,
  metric,
} from './loaders-shared';

export type MaterializedEconomicsReport = EconomicsReport & { materializedFacts: true };

export function isMaterializedEconomicsReport(
  report: EconomicsReport,
): report is MaterializedEconomicsReport {
  return 'materializedFacts' in report && report.materializedFacts === true;
}

export function materializedFactsAreUsable(input: {
  requestedStartDate: string | null;
  requestedEndDate: string;
  earliestFactDay: string | null;
  latestFactDay: string | null;
  hasCompleteDateSpine: boolean;
  semanticsVersions: number[];
  oldestRefresh: string | null;
  dependenciesUpdatedAt: string | null;
  unresolvedFridayRollforward?: boolean;
}) {
  return Boolean(
    input.earliestFactDay &&
    input.latestFactDay &&
    (!input.requestedStartDate || input.earliestFactDay === input.requestedStartDate) &&
    input.latestFactDay >= input.requestedEndDate &&
    input.hasCompleteDateSpine &&
    input.semanticsVersions.length > 0 &&
    input.semanticsVersions.every((version) => version === ANALYTICS_FACT_SEMANTICS_VERSION) &&
    input.oldestRefresh &&
    (!input.dependenciesUpdatedAt || input.oldestRefresh >= input.dependenciesUpdatedAt) &&
    !input.unresolvedFridayRollforward,
  );
}

export async function loadMaterializedEconomicsReport(
  db: Database,
  filters: AnalyticsFilters,
): Promise<MaterializedEconomicsReport | null> {
  const dependencyStartDate = filters.startDate ? addDays(filters.startDate, -7) : null;
  const factWhere = datePredicate(
    analyticsEconomicsDailyFacts.day,
    filters.startDate,
    filters.endDate,
  );
  const [factResult, dependencyResult, settings, costs] = await Promise.all([
    db.execute(sql`
      select ${analyticsEconomicsDailyFacts.day}::text as day,
        ${analyticsEconomicsDailyFacts.calculatorDay} as calculator_day,
        ${analyticsEconomicsDailyFacts.semanticsVersion} as semantics_version,
        ${analyticsEconomicsDailyFacts.refreshedAt} as refreshed_at
      from ${analyticsEconomicsDailyFacts}
      where ${factWhere}
      order by ${analyticsEconomicsDailyFacts.day} asc
    `),
    db.execute(sql`
      with first_posted as (
        select distinct on (${orderStatusHistory.orderId})
          ${orderStatusHistory.orderId} as order_id,
          (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
        from ${orderStatusHistory}
        where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
        order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
      ), requested_cohort as (
        select order_id from first_posted
        where ${datePredicate(sql`first_posted.posted_day`, dependencyStartDate, filters.endDate)}
      )
      select greatest(
        (select max(${orders.updatedAt}) from ${orders}
          inner join requested_cohort on requested_cohort.order_id = ${orders.id}),
        (select max(${orderLineItems.updatedAt}) from ${orderLineItems}
          inner join requested_cohort on requested_cohort.order_id = ${orderLineItems.orderId}),
        (select max(${orderStatusHistory.changedAt}) from ${orderStatusHistory}
          inner join requested_cohort
            on requested_cohort.order_id = ${orderStatusHistory.orderId}),
        (select max(${ecotrackOrderStates.updatedAt}) from ${ecotrackOrderStates}
          inner join requested_cohort
            on requested_cohort.order_id = ${ecotrackOrderStates.orderId}),
        (select max(${ecotrackOrderTrackingEvents.updatedAt})
          from ${ecotrackOrderTrackingEvents}
          inner join requested_cohort
            on requested_cohort.order_id = ${ecotrackOrderTrackingEvents.orderId}),
        (select max(${metaAdsDailyInsights.updatedAt}) from ${metaAdsDailyInsights}
          where ${datePredicate(metaAdsDailyInsights.day, dependencyStartDate, filters.endDate)}),
        (select max(${profitTrackerDays.updatedAt}) from ${profitTrackerDays}
          where ${datePredicate(profitTrackerDays.day, dependencyStartDate, filters.endDate)}),
        (select max(${profitTrackerOperatingCosts.updatedAt})
          from ${profitTrackerOperatingCosts}),
        (select max(${profitTrackerSettings.updatedAt}) from ${profitTrackerSettings})
      ) as dependencies_updated_at,
      to_char(least(
        (select min((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
          from ${orderStatusHistory} where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}),
        (select min(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}),
        (select min(${profitTrackerDays.day}) from ${profitTrackerDays})
      ), 'YYYY-MM-DD') as required_start_date,
      exists (
        select 1 from ${processedOrders}
        where ${timestampPredicate(sql`coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})`, filters.startDate, filters.endDate)}
      ) as has_imported_settlements
    `),
    getProfitTrackerSettings(db),
    listProfitTrackerCosts(db),
  ]);
  const rows = factResult.rows as Array<Record<string, unknown>>;
  if (
    !rows.length ||
    (dependencyResult.rows[0] as { has_imported_settlements?: boolean } | undefined)
      ?.has_imported_settlements
  )
    return null;
  const dependencyUpdatedAt = isoValue(
    (dependencyResult.rows[0] as Record<string, unknown> | undefined)?.dependencies_updated_at,
  );
  const dependencyRow = dependencyResult.rows[0] as Record<string, unknown> | undefined;
  const requiredStartDate =
    filters.startDate ??
    (typeof dependencyRow?.required_start_date === 'string'
      ? dependencyRow.required_start_date
      : null);
  const oldestRefresh = rows
    .map((row) => isoValue(row.refreshed_at))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0);
  const earliestFactDay = String(rows.at(0)?.day ?? '');
  const latestFactDay = String(rows.at(-1)?.day ?? '');
  const hasCompleteDateSpine = Boolean(
    requiredStartDate &&
    earliestFactDay &&
    latestFactDay &&
    rows.length === inclusiveDays(requiredStartDate, filters.endDate),
  );
  const calculatorDays = rows.map((row) =>
    analyticsCalculatorDaySchema.safeParse(row.calculator_day),
  );
  if (
    calculatorDays.some(
      (parsed, index) => !parsed.success || parsed.data.day.date !== String(rows[index]?.day),
    )
  )
    return null;
  const factsAreUsable = materializedFactsAreUsable({
    requestedStartDate: requiredStartDate,
    requestedEndDate: filters.endDate,
    earliestFactDay: earliestFactDay || null,
    latestFactDay: latestFactDay || null,
    hasCompleteDateSpine,
    semanticsVersions: rows.map((row) => numeric(row.semantics_version)),
    oldestRefresh: oldestRefresh ?? null,
    dependenciesUpdatedAt: dependencyUpdatedAt,
  });
  if (!factsAreUsable) return null;

  let cumulativeNetDzd = 0;
  let cumulativeNetBeforeReturnsDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  const ascendingDays = calculatorDays.map((parsed) => {
    if (!parsed.success) throw new Error('Invalid calculator fact.');
    const day = parsed.data.day;
    cumulativeNetDzd += day.metrics.netProfitDzd ?? 0;
    cumulativeNetBeforeReturnsDzd += day.metrics.netProfitBeforeReturnsDzd ?? 0;
    cumulativeTrueProfitDzd += day.trueProfitDzd ?? 0;
    return { ...day, cumulativeNetDzd, cumulativeNetBeforeReturnsDzd, cumulativeTrueProfitDzd };
  });
  const days = [...ascendingDays].reverse();
  const profitsSuppressed = settings.defaultReturnRate === 100;
  const summary = summarizeProfitTracker(
    days,
    costs,
    requiredStartDate,
    latestFactDay,
    profitsSuppressed,
  );
  const weeks = buildProfitTrackerWeeks(days, costs, filters.endDate, profitsSuppressed);
  const { postedOrders, costCompleteOrders, projectedCoveragePct } = summary;
  const pendingRollforwardDzd = days[0]?.isRestDay ? days[0].rolledOutDzd : 0;
  const metaSyncedAt =
    days
      .map((day) => day.metaSyncedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  return {
    materializedFacts: true,
    filters: {
      range: filters.range,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    settings,
    summary,
    days,
    weeks,
    costs,
    adsets: [],
    adsetDailySpend: [],
    realized: {
      summary: {
        settledOrders: 0,
        amountCollectedDzd: 0,
        netRevenueDzd: 0,
        feesDzd: 0,
        realizedProfitDzd: 0,
        knownMetaAdCostDzd: 0,
        realizedProfitAfterAdsDzd: 0,
        metaCoveredDays: 0,
        postedOrders,
        settlementCoveragePct: null,
      },
      days: [],
      reportThroughDate: null,
    },
    coverage: {
      projectedOrders: postedOrders,
      costCompleteOrders,
      projectedCoveragePct,
      settledOrders: 0,
      settlementCoveragePct: null,
      metaDays: days.filter((day) => day.spendEur != null).length,
      pendingRollforwardDzd,
    },
    warnings: [
      ...(projectedCoveragePct != null && projectedCoveragePct < 95
        ? [
            'Some posted orders use the 30% fallback product margin because purchase-cost snapshots are incomplete.',
          ]
        : []),
      ...(pendingRollforwardDzd > 0
        ? ['The trailing Friday Meta spend is pending roll-forward to the next working day.']
        : []),
    ],
    freshness: {
      metaSyncedAt,
      settledReportThroughDate: null,
    },
  } satisfies MaterializedEconomicsReport;
}

export async function loadEconomicsPair(
  db: Database,
  filters: AnalyticsFilters,
  ...sourceStarts: Array<string | null>
) {
  const previousFiltersValue = previousFiltersWithCoverage(filters, ...sourceStarts);
  const [current, previousReport] = await Promise.all([
    loadMaterializedEconomicsReport(db, filters).then(
      (report) => report ?? loadProfitTrackerReportForRange(db, filters),
    ),
    previousFiltersValue
      ? loadMaterializedEconomicsReport(db, previousFiltersValue).then(
          (report) => report ?? loadProfitTrackerReportForRange(db, previousFiltersValue),
        )
      : Promise.resolve<EconomicsReport | null>(null),
  ]);
  return { current, previous: previousReport };
}

export function economicsSummaryMetrics(
  current: ProfitTrackerSummary,
  previous: ProfitTrackerSummary | null,
) {
  return [
    metric('trueProfit', current.trueProfitDzd, previous?.trueProfitDzd ?? null, 'dzd'),
    metric('profitX', current.profitX, previous?.profitX ?? null, 'ratio'),
    metric('adjustedProfit', current.adjustedProfitDzd, previous?.adjustedProfitDzd ?? null, 'dzd'),
    metric('grossProfit', current.grossProfitDzd, previous?.grossProfitDzd ?? null, 'dzd'),
    metric('adCost', current.rawAdCostDzd, previous?.rawAdCostDzd ?? null, 'dzd', 'neutral'),
    metric('postedOrders', current.postedOrders, previous?.postedOrders ?? null, 'number'),
    metric(
      'costPerPosted',
      current.postedOrders > 0 ? current.ratioAdCostDzd / current.postedOrders : null,
      previous && previous.postedOrders > 0
        ? previous.ratioAdCostDzd / previous.postedOrders
        : null,
      'dzd',
      'down',
    ),
  ];
}

export function economicsMetrics(current: EconomicsReport, previous: EconomicsReport | null) {
  return economicsSummaryMetrics(current.summary, previous?.summary ?? null);
}

export function buildSignals(
  economics: EconomicsReport,
  returns: AnalyticsReturnObservation,
  fulfillment: AnalyticsFulfillmentSummary,
) {
  const signals: Array<{
    key: string;
    severity: 'critical' | 'watch' | 'positive' | 'info';
    value: number | null;
    unit: AnalyticsMetric['unit'];
  }> = [];
  if (economics.summary.profitX != null) {
    signals.push({
      key: economics.summary.profitX < 1 ? 'belowBreakEven' : 'aboveBreakEven',
      severity: economics.summary.profitX < 1 ? 'critical' : 'positive',
      value: economics.summary.profitX,
      unit: 'ratio',
    });
  }
  if (
    returns.mature.ratePct != null &&
    Math.abs(returns.mature.ratePct - returns.planningRatePct) >= 3
  ) {
    signals.push({
      key: 'returnAssumptionGap',
      severity: 'watch',
      value: returns.mature.ratePct - returns.planningRatePct,
      unit: 'percent',
    });
  }
  if (
    economics.summary.projectedCoveragePct != null &&
    economics.summary.projectedCoveragePct < 98
  ) {
    signals.push({
      key: 'costCoverageGap',
      severity: 'watch',
      value: economics.summary.projectedCoveragePct,
      unit: 'percent',
    });
  }
  if (economics.coverage.pendingRollforwardDzd > 0) {
    signals.push({
      key: 'fridayPending',
      severity: 'info',
      value: economics.coverage.pendingRollforwardDzd,
      unit: 'dzd',
    });
  }
  if (fulfillment.activeShipments > 0) {
    signals.push({
      key: 'activePipeline',
      severity: 'info',
      value: fulfillment.activeShipments,
      unit: 'number',
    });
  }
  return signals;
}

function previousFilters(filters: AnalyticsFilters): AnalyticsFilters | null {
  if (!filters.comparisonStartDate || !filters.comparisonEndDate) return null;
  return {
    ...filters,
    range: 'custom',
    startDate: filters.comparisonStartDate,
    endDate: filters.comparisonEndDate,
    comparisonStartDate: null,
    comparisonEndDate: null,
  };
}

export function previousFiltersWithCoverage(
  filters: AnalyticsFilters,
  ...sourceStarts: Array<string | null>
): AnalyticsFilters | null {
  const previous = previousFilters(filters);
  if (!previous || !previous.startDate || sourceStarts.some((date) => date == null)) return null;
  const coverageStart = [...(sourceStarts as string[])].sort().at(-1);
  return coverageStart && previous.startDate >= coverageStart ? previous : null;
}

export function sourceWarnings(sources: AnalyticsSource[]) {
  return sources.flatMap((source) => [
    ...(source.dateBasis === 'includes_legacy_utc'
      ? [{ key: 'legacyUtcTraffic', source: source.key }]
      : []),
    ...(source.state === 'missing' || source.state === 'partial'
      ? [
          {
            key: source.state === 'missing' ? 'sourceMissing' : 'sourcePartial',
            source: source.key,
            value: source.coveragePct,
          },
        ]
      : []),
  ]);
}

export function economicsWarnings(report: EconomicsReport) {
  const warnings: Array<{ key: string; value?: number | null }> = [];
  if (report.coverage.projectedCoveragePct != null && report.coverage.projectedCoveragePct < 95) {
    warnings.push({ key: 'projectedCostCoverage', value: report.coverage.projectedCoveragePct });
  }
  if (report.coverage.pendingRollforwardDzd > 0) {
    warnings.push({
      key: 'pendingFridayRollforward',
      value: report.coverage.pendingRollforwardDzd,
    });
  }
  return warnings;
}
