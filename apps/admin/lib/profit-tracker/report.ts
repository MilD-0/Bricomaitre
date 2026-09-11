import { getDb } from '@bric/db/client';
import { type AnalyticsFilters } from '../analytics/contract';
import { resolveAnalyticsFilters } from '../analytics/date-range';
import {
  buildProfitTrackerWeeks,
  calculateProfitAmounts,
  dayProfitsSuppressed,
  operatingCostForDay,
  summarizeProfitTracker,
} from '../profit-tracker-metrics';
import { loadProfitTrackerCalculationDays, profitTrackerQueryStartDate } from './calculation';
import { profitTrackerRangeSchema, type Database, type ProfitTrackerRangeInput } from './contract';
import { listProfitTrackerCosts } from './records';
import { listAdsetPerformance, loadRealizedDayEconomics } from './sources';

export async function getProfitTrackerReport(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const db = options.db ?? getDb();
  const { range, startDate, endDate } = resolveAnalyticsFilters(
    { ...profitTrackerRangeSchema.parse(input), view: 'money', grain: 'auto' },
    options.now,
  );
  return loadProfitTrackerReportForRange(db, { range, startDate, endDate });
}

export async function loadProfitTrackerReportForRange(
  db: Database,
  filters: Pick<AnalyticsFilters, 'range' | 'startDate' | 'endDate'>,
) {
  const queryStartDate = profitTrackerQueryStartDate(filters);
  const realizedPromise = loadRealizedDayEconomics(db, queryStartDate, filters.endDate);
  const [{ settings, selected, metaDays }, costs, realizedDays] = await Promise.all([
    loadProfitTrackerCalculationDays(
      db,
      filters,
      realizedPromise.then((days) => days.map((day) => day.date)),
    ),
    listProfitTrackerCosts(db),
    realizedPromise,
  ]);
  const realizedByDate = new Map(realizedDays.map((day) => [day.date, day]));
  const effectiveStartDate = filters.startDate ?? selected.at(-1)?.date ?? null;
  const effectiveEndDate = selected[0]?.date ?? filters.endDate;
  const profitsSuppressed = settings.defaultReturnRate === 100;
  const summary = summarizeProfitTracker(
    selected,
    costs,
    effectiveStartDate,
    effectiveStartDate ? effectiveEndDate : null,
    profitsSuppressed,
  );
  let cumulativeNetDzd = 0;
  let cumulativeNetBeforeReturnsDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  const enrichedAscending = [...selected].reverse().map((day) => {
    const operatingCostDzd = operatingCostForDay(day.date, costs);
    const { trueProfitDzd } = calculateProfitAmounts({
      adjustedProfitDzd: day.metrics.adjustedProfitDzd,
      adCostDzd: day.metrics.adCostDzd,
      operatingCostDzd,
      profitsSuppressed: profitsSuppressed || dayProfitsSuppressed(day),
    });
    cumulativeNetDzd += day.metrics.netProfitDzd || 0;
    cumulativeNetBeforeReturnsDzd += day.metrics.netProfitBeforeReturnsDzd || 0;
    cumulativeTrueProfitDzd += trueProfitDzd || 0;
    return {
      ...day,
      operatingCostDzd,
      trueProfitDzd,
      cumulativeNetDzd,
      cumulativeNetBeforeReturnsDzd,
      cumulativeTrueProfitDzd,
    };
  });
  const days = enrichedAscending.reverse();
  const dayByDate = new Map(selected.map((day) => [day.date, day]));
  const adsetPerformance = await listAdsetPerformance(
    filters.startDate,
    filters.endDate,
    dayByDate,
    settings.fxRate,
    db,
  );
  const realizedSelected = [...realizedByDate.values()]
    .filter(
      (day) => (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((day) => {
      const knownMetaAdCostDzd = dayByDate.get(day.date)?.metrics.adCostDzd ?? null;
      return {
        ...day,
        realizedProfitDzd: profitsSuppressed ? 0 : day.realizedProfitDzd,
        knownMetaAdCostDzd,
        realizedProfitAfterAdsDzd: profitsSuppressed
          ? 0
          : knownMetaAdCostDzd == null
            ? null
            : day.realizedProfitDzd - knownMetaAdCostDzd,
      };
    });
  const realizedSummary = realizedSelected.reduce(
    (total, day) => {
      total.settledOrders += day.settledOrders;
      total.offPipelineSales += day.offPipelineSales;
      total.amountCollectedDzd += day.amountCollectedDzd;
      total.netRevenueDzd += day.netRevenueDzd;
      total.feesDzd += day.feesDzd;
      total.realizedProfitDzd += day.realizedProfitDzd;
      if (day.knownMetaAdCostDzd != null) {
        total.knownMetaAdCostDzd += day.knownMetaAdCostDzd;
        total.realizedProfitAfterAdsDzd += day.realizedProfitAfterAdsDzd || 0;
        total.metaCoveredDays += 1;
      }
      return total;
    },
    {
      settledOrders: 0,
      offPipelineSales: 0,
      amountCollectedDzd: 0,
      netRevenueDzd: 0,
      feesDzd: 0,
      realizedProfitDzd: 0,
      knownMetaAdCostDzd: 0,
      realizedProfitAfterAdsDzd: 0,
      metaCoveredDays: 0,
    },
  );
  const periodMetaDays = selected.filter((day) => day.metrics.adCostDzd != null);
  const periodKnownMetaAdCostDzd = summary.ratioAdCostDzd;
  realizedSummary.knownMetaAdCostDzd = periodKnownMetaAdCostDzd;
  realizedSummary.realizedProfitAfterAdsDzd = profitsSuppressed
    ? 0
    : realizedSummary.realizedProfitDzd - periodKnownMetaAdCostDzd;
  realizedSummary.metaCoveredDays = periodMetaDays.length;
  const reportThroughDate = realizedSelected.at(0)?.date ?? null;
  const settlementCoveragePct =
    summary.postedOrders > 0 ? (realizedSummary.settledOrders / summary.postedOrders) * 100 : null;
  const pendingRollforwardDzd = selected[0]?.isRestDay ? selected[0].rolledOutDzd : 0;

  return {
    filters: {
      ...filters,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    },
    settings,
    summary,
    days,
    weeks: buildProfitTrackerWeeks(selected, costs, filters.endDate, profitsSuppressed),
    costs,
    adsets: adsetPerformance.summary,
    adsetDailySpend: adsetPerformance.daily,
    realized: {
      summary: {
        ...realizedSummary,
        postedOrders: summary.postedOrders,
        settlementCoveragePct,
      },
      days: realizedSelected,
      reportThroughDate,
    },
    coverage: {
      projectedOrders: summary.postedOrders,
      costCompleteOrders: summary.costCompleteOrders,
      projectedCoveragePct: summary.projectedCoveragePct,
      settledOrders: realizedSummary.settledOrders,
      settlementCoveragePct,
      metaDays: metaDays.filter(
        (day) =>
          (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
      ).length,
      pendingRollforwardDzd,
    },
    warnings: [
      ...(summary.projectedCoveragePct != null && summary.projectedCoveragePct < 95
        ? [
            'Some posted orders use the 30% fallback product margin because purchase-cost snapshots are incomplete.',
          ]
        : []),
      ...(pendingRollforwardDzd > 0
        ? ['The trailing Friday Meta spend is pending roll-forward to the next working day.']
        : []),
    ],
    freshness: {
      metaSyncedAt:
        days
          .map((day) => day.metaSyncedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
      settledReportThroughDate: reportThroughDate,
    },
  };
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function exportProfitTrackerCsv(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const report = await getProfitTrackerReport(input, options);
  const header = [
    'date',
    'spend_eur',
    'impressions',
    'fb_purchases',
    'cpm',
    'ctr',
    'link_clicks',
    'landing_page_views',
    'gross_profit_dzd',
    'gross_profit_source',
    'return_rate_pct',
    'return_rate_source',
    'posted_or_manual_orders',
    'posted_or_manual_orders_source',
    'posted_orders',
    'cost_complete_orders',
    'projected_coverage_pct',
    'fx_rate_used',
    'ad_cost_dzd',
    'adjusted_profit_dzd',
    'net_profit_dzd',
    'profit_x',
    'net_profit_before_returns_dzd',
    'profit_x_before_returns',
    'cost_per_posted_or_manual_order_dzd',
    'posted_or_manual_orders_to_meta_purchases_pct',
    'click_to_page_rate_pct',
    'operating_cost_dzd',
    'true_profit_dzd',
    'is_rest_day',
    'rolled_in_dzd',
    'rolled_out_dzd',
    'note',
  ];
  const lines = [...report.days]
    .reverse()
    .map((day) =>
      [
        day.date,
        day.spendEur,
        day.impressions,
        day.fbPurchases,
        day.cpm,
        day.ctr,
        day.linkClicks,
        day.landingPageViews,
        day.grossProfitDzd,
        day.grossProfitSource,
        day.returnRatePct,
        day.returnRateSource,
        day.confirmedOrders,
        day.confirmedOrdersSource,
        day.postedOrders,
        day.costCompleteOrders,
        day.projectedCoveragePct,
        day.fxRateUsed,
        day.metrics.adCostDzd,
        day.metrics.adjustedProfitDzd,
        day.metrics.netProfitDzd,
        day.metrics.profitX,
        day.metrics.netProfitBeforeReturnsDzd,
        day.metrics.profitXBeforeReturns,
        day.metrics.costPerConfirmedDzd,
        day.metrics.confirmationRatePct,
        day.metrics.clickToPageRatePct,
        day.operatingCostDzd,
        day.trueProfitDzd,
        day.isRestDay,
        day.rolledInDzd,
        day.rolledOutDzd,
        day.note,
      ]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...lines].join('\n');
}
