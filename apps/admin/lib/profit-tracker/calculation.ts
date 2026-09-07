import { profitTrackerDays } from '@bric/db/schema';
import { and, asc, gte, lte } from 'drizzle-orm';
import { type AnalyticsFilters } from '../analytics/contract';
import { addDays } from '../analytics/date-range';
import { isoValue as isoTimestamp } from '../analytics/query-values';
import {
  applyProfitTrackerRollforward,
  type ProfitTrackerDayInput,
  type ProfitTrackerSettings,
} from '../profit-tracker-metrics';
import { type AutomaticDayEconomics, type Database, type MetaDayEconomics } from './contract';
import { getProfitTrackerSettings, mapDay } from './records';
import { loadAutomaticDayEconomics, loadMetaDayEconomics, loadRealizedDayDates } from './sources';

export function resolveProfitTrackerDaySources({
  date,
  manual,
  automatic,
  meta,
  settings,
}: {
  date: string;
  manual?: ProfitTrackerDayInput;
  automatic?: AutomaticDayEconomics;
  meta?: MetaDayEconomics;
  settings: ProfitTrackerSettings;
}): ProfitTrackerDayInput {
  const grossProfitDzd = manual?.grossProfitDzd ?? automatic?.grossProfitDzd ?? null;
  const confirmedOrders = manual?.confirmedOrders ?? automatic?.postedOrders ?? null;
  const returnRatePct =
    grossProfitDzd == null ? null : (manual?.returnRatePct ?? settings.defaultReturnRate);
  const postedOrders = automatic?.postedOrders ?? 0;
  const costCompleteOrders = automatic?.costCompleteOrders ?? 0;
  const stateAdjustedProfitDzd =
    manual?.grossProfitDzd != null || grossProfitDzd == null || returnRatePct == null || !automatic
      ? undefined
      : stateAwareProjectedContribution({
          realizedGrossProfitDzd: automatic.realizedGrossProfitDzd,
          returnExposedGrossProfitDzd: automatic.returnExposedGrossProfitDzd,
          planningReturnRatePct: returnRatePct,
        });

  return {
    date,
    spendEur: meta?.spendEur ?? null,
    impressions: meta?.impressions ?? null,
    fbPurchases: meta?.fbPurchases ?? null,
    cpm: meta?.cpm ?? null,
    ctr: meta?.ctr ?? null,
    linkClicks: meta?.linkClicks ?? null,
    landingPageViews: meta?.landingPageViews ?? null,
    grossProfitDzd,
    returnRatePct,
    confirmedOrders,
    note: manual?.note ?? null,
    fxRateUsed: manual?.fxRateUsed ?? settings.fxRate,
    metaSyncedAt: meta?.metaSyncedAt ?? null,
    grossProfitSource:
      manual?.grossProfitDzd != null
        ? 'manual'
        : automatic?.grossProfitDzd != null
          ? 'automatic'
          : 'missing',
    returnRateSource:
      grossProfitDzd == null ? 'missing' : manual?.returnRatePct != null ? 'manual' : 'default',
    confirmedOrdersSource:
      manual?.confirmedOrders != null ? 'manual' : automatic ? 'automatic' : 'missing',
    postedOrders,
    costCompleteOrders,
    projectedCoveragePct: postedOrders > 0 ? (costCompleteOrders / postedOrders) * 100 : null,
    stateAdjustedProfitDzd,
    returnExposedOrders: automatic?.returnExposedOrders ?? postedOrders,
  };
}

export function stateAwareProjectedContribution({
  realizedGrossProfitDzd,
  returnExposedGrossProfitDzd,
  planningReturnRatePct,
}: {
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  planningReturnRatePct: number;
}) {
  if (planningReturnRatePct === 100) return 0;
  return realizedGrossProfitDzd + returnExposedGrossProfitDzd * (1 - planningReturnRatePct / 100);
}

export function indexMetaDays(
  metaDays: MetaDayEconomics[],
  dayRows: Array<typeof profitTrackerDays.$inferSelect>,
) {
  const metaByDate = new Map(metaDays.map((day) => [day.date, day]));
  // A successful range sync records days that Meta omitted because activity was zero.
  // Historical manual inputs and days outside those synced ranges remain unknown.
  for (const row of dayRows) {
    const evidence = row.rawMetaJson as {
      source?: string;
      rows?: number;
      currency?: string;
    } | null;
    if (
      !metaByDate.has(row.day) &&
      row.metaSyncedAt &&
      evidence?.source === 'meta_ads_daily_insights' &&
      evidence.rows === 0 &&
      evidence.currency === 'EUR'
    ) {
      metaByDate.set(row.day, {
        date: row.day,
        accountCurrency: 'EUR',
        spendEur: 0,
        impressions: 0,
        fbPurchases: 0,
        cpm: 0,
        ctr: 0,
        linkClicks: 0,
        landingPageViews: 0,
        metaSyncedAt: isoTimestamp(row.metaSyncedAt),
      });
    }
  }

  return metaByDate;
}

export // Canonical reporting clips already-validated source windows. A source with no
// overlapping coverage intentionally supplies an empty start > end interval.
function profitTrackerQueryStartDate(filters: Pick<AnalyticsFilters, 'startDate' | 'endDate'>) {
  return filters.startDate
    ? filters.startDate > filters.endDate
      ? filters.startDate
      : addDays(filters.startDate, -7)
    : null;
}

export async function loadProfitTrackerCalculationDays(
  db: Database,
  filters: Pick<AnalyticsFilters, 'range' | 'startDate' | 'endDate'>,
  settlementDates?: Promise<string[]>,
) {
  const settings = await getProfitTrackerSettings(db);
  const queryStartDate = profitTrackerQueryStartDate(filters);
  const dayConditions = [lte(profitTrackerDays.day, filters.endDate)];
  if (queryStartDate) dayConditions.push(gte(profitTrackerDays.day, queryStartDate));
  const [dayRows, automaticDays, metaDays, realizedDates] = await Promise.all([
    db
      .select()
      .from(profitTrackerDays)
      .where(and(...dayConditions))
      .orderBy(asc(profitTrackerDays.day)),
    loadAutomaticDayEconomics(db, queryStartDate, filters.endDate),
    loadMetaDayEconomics(db, queryStartDate, filters.endDate),
    settlementDates ?? loadRealizedDayDates(db, queryStartDate, filters.endDate),
  ]);

  const unsupportedCurrency = metaDays.find(
    (day) => day.accountCurrency?.toUpperCase() !== 'EUR',
  )?.accountCurrency;
  if (unsupportedCurrency !== undefined) {
    throw new Error(
      `Profit tracker requires an EUR Meta account; received ${unsupportedCurrency || 'mixed currencies'}.`,
    );
  }

  const manualByDate = new Map(dayRows.map((row) => [row.day, mapDay(row)]));
  const automaticByDate = new Map(automaticDays.map((day) => [day.date, day]));
  const metaByDate = indexMetaDays(metaDays, dayRows);
  const dates = new Set<string>([
    ...manualByDate.keys(),
    ...automaticByDate.keys(),
    ...metaByDate.keys(),
    ...realizedDates,
  ]);
  const canonicalDays = [...dates].sort().map((date): ProfitTrackerDayInput =>
    resolveProfitTrackerDaySources({
      date,
      manual: manualByDate.get(date),
      automatic: automaticByDate.get(date),
      meta: metaByDate.get(date),
      settings,
    }),
  );
  const rolled = applyProfitTrackerRollforward(canonicalDays, settings);
  const selected = rolled.filter(
    (day) => (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
  );
  return { settings, selected, metaDays };
}
