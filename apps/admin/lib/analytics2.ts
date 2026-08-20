import { sql, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsEvents,
  brands,
  categories,
  ecotrackOrderActivities,
  ecotrackOrderStatusObservations,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackWilayas,
  metaAdsDailyInsights,
  metaAdsBreakdownDailyInsights,
  metaAdsDeliveryEntities,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
  profitTrackerDays,
  products as productCatalog,
} from '@bric/db/schema';
import { CONFIRMED_LIFECYCLE_ORDER_STATUSES } from '@bric/storefront-core/order-domain';

import { getProfitTrackerReport, type ProfitTrackerRangeInput } from './profit-tracker';
import {
  getStatsDashboard,
  getStatsDashboardSection,
  type StatsDashboardData,
  type StatsFilters,
} from './stats';
import { loadSearchAnalytics } from './analytics2-search';

type Database = ReturnType<typeof getDb>;
type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

export const analytics2Views = [
  'command',
  'money',
  'acquisition',
  'fulfillment',
  'storefront',
  'search',
  'catalog',
  'assumptions',
] as const;

export type Analytics2View = (typeof analytics2Views)[number];
export type Analytics2Grain = 'auto' | 'day' | 'week' | 'month';
export type Analytics2ResolvedGrain = Exclude<Analytics2Grain, 'auto'>;
export type Analytics2Range = '7d' | '14d' | '30d' | '90d' | 'year' | 'all' | 'custom';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateOnlySchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

export const analytics2QuerySchema = z
  .object({
    view: z.enum(analytics2Views).default('command'),
    range: z.enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']).default('30d'),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    grain: z.enum(['auto', 'day', 'week', 'month']).default('auto'),
  })
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
        path: ['startDate'],
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
        path: ['startDate'],
      });
    }
  });

export type Analytics2Query = z.input<typeof analytics2QuerySchema>;

export type Analytics2Filters = {
  view: Analytics2View;
  range: Analytics2Range;
  startDate: string | null;
  endDate: string;
  grain: Analytics2Grain;
  resolvedGrain: Analytics2ResolvedGrain;
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
};

export type Analytics2Metric = {
  key: string;
  value: number | null;
  previous: number | null;
  changePct: number | null;
  unit: 'dzd' | 'eur' | 'number' | 'percent' | 'ratio' | 'hours';
  goodWhen?: 'up' | 'down' | 'neutral';
};

export type Analytics2Source = {
  key:
    'orders' | 'ecotrack' | 'meta' | 'storefront' | 'searchConsole' | 'settlements' | 'assumptions';
  state: 'live' | 'current' | 'lagged' | 'manual' | 'partial' | 'missing';
  updatedAt: string | null;
  throughDate: string | null;
  records: number;
  coveragePct: number | null;
};

export type Analytics2EconomicsPoint = {
  bucket: string;
  label: string;
  grossProfitDzd: number | null;
  adjustedProfitDzd: number | null;
  adCostDzd: number | null;
  netProfitDzd: number | null;
  trueProfitDzd: number | null;
  realizedProfitDzd: number | null;
  realizedProfitAfterAdsDzd: number | null;
  postedOrders: number;
  settledOrders: number;
  profitX: number | null;
  profitXBeforeReturns: number | null;
  projectedCoveragePct: number | null;
  cumulativeNetProfitDzd: number | null;
  cumulativeTrueProfitDzd: number | null;
  cumulativeRealizedProfitDzd: number | null;
  isPartial: boolean;
};

export type Analytics2ReturnObservation = {
  planningRatePct: number;
  mature: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
    cutoffDate: string;
  };
  allTerminal: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
  };
};

export type Analytics2FulfillmentSummary = {
  submittedOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  activeShipments: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  terminalOrders: number;
  observedReturnRatePct: number | null;
  matureObservedReturnRatePct: number | null;
};

export type Analytics2AutomaticPaidDay = {
  date: string;
  paidOrders: number;
  codDzd: number;
  feesDzd: number;
  netRecoveredDzd: number;
  productCostDzd: number;
  profitDzd: number;
  completeOrders: number;
  providerAmountOrders: number;
  legacyAmountOrders: number;
  submittedAmountOrders: number;
};

export type Analytics2AutomaticPaidEconomics = {
  summary: {
    paidOrders: number;
    codDzd: number;
    feesDzd: number;
    netRecoveredDzd: number;
    productCostDzd: number;
    profitDzd: number;
    completeOrders: number;
    profitCoveragePct: number | null;
    providerAmountCoveragePct: number | null;
    legacyFallbackOrders: number;
    submittedFallbackOrders: number;
  };
  days: Analytics2AutomaticPaidDay[];
};

export type Analytics2EntityLevel = 'campaign' | 'adset' | 'ad';

export type Analytics2MetaEntity = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  spendEur: number;
  adCostDzd: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  uniqueOutboundClicks: number;
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;
  metaPurchases: number;
  purchaseValue: number;
  videoPlays: number;
  videoP25Watched: number;
  videoP50Watched: number;
  videoP75Watched: number;
  videoP95Watched: number;
  videoP100Watched: number;
  videoAverageWatchSeconds: number | null;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  bricOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  ctrPct: number | null;
  outboundCtrPct: number | null;
  landingViewRatePct: number | null;
  cpmEur: number | null;
  videoPlayRatePct: number | null;
  videoCompletionRatePct: number | null;
  costPerPostedDzd: number | null;
  costPerConfirmedDzd: number | null;
  costPerDeliveredDzd: number | null;
  costPerPaidDzd: number | null;
  platformRoas: number | null;
};

function numeric(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoValue(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function inclusiveDays(startDate: string, endDate: string) {
  return (
    Math.floor(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

function dayInTimezone(now: Date, timezone = 'Africa/Algiers') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resolveAnalytics2ReferenceNow(
  setting: string | undefined,
  cutoffDate: string | null,
  wallNow = new Date(),
) {
  const normalized = setting?.trim().toLowerCase();
  const referenceDate = ISO_DATE_PATTERN.test(normalized ?? '')
    ? normalized!
    : normalized === 'dataset'
      ? cutoffDate
      : null;
  if (!referenceDate) {
    return { now: wallNow, referenceDate: dayInTimezone(wallNow), reviewClock: false };
  }
  return {
    now: new Date(`${referenceDate}T12:00:00.000Z`),
    referenceDate,
    reviewClock: true,
  };
}

async function loadDatasetCutoffDate(db: Database, view: Analytics2View) {
  const cutoff =
    view === 'storefront'
      ? sql`greatest(
          (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
            from ${analyticsEvents}),
          (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups})
        )`
      : view === 'search'
        ? sql`(select max(day) from search_console_daily_totals)`
        : view === 'acquisition'
          ? sql`(select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights})`
          : view === 'fulfillment'
            ? sql`greatest(
                (select max(${ecotrackOrderTrackingEvents.eventDate}) from ${ecotrackOrderTrackingEvents}),
                (select max((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
                  from ${orderStatusHistory})
              )`
            : view === 'catalog'
              ? sql`greatest(
                  (select max((${orders.createdAt} at time zone 'Africa/Algiers')::date) from ${orders}),
                  (select max(posted_day) from admin.analytics_order_cohort_facts)
                )`
              : sql`greatest(
                  (select max(day) from admin.analytics_economics_daily_facts),
                  (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}),
                  (select max(${profitTrackerDays.day}) from ${profitTrackerDays})
                )`;
  const result = await db.execute(sql`
    select to_char(${cutoff}, 'YYYY-MM-DD') as cutoff_date
  `);
  const value = (result.rows[0] as { cutoff_date?: unknown } | undefined)?.cutoff_date;
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
}

function clampQueryToReference(query: Analytics2Query, referenceDate: string) {
  if (query.range !== 'custom' || !query.startDate || !query.endDate) return query;
  const endDate = query.endDate > referenceDate ? referenceDate : query.endDate;
  return {
    ...query,
    startDate: query.startDate > endDate ? endDate : query.startDate,
    endDate,
  };
}

function autoGrain(startDate: string | null, endDate: string): Analytics2ResolvedGrain {
  if (!startDate) return 'month';
  const days = inclusiveDays(startDate, endDate);
  if (days <= 45) return 'day';
  if (days <= 240) return 'week';
  return 'month';
}

export function resolveAnalytics2Filters(
  raw: Analytics2Query,
  now = new Date(),
): Analytics2Filters {
  const parsed = analytics2QuerySchema.parse(raw);
  const endDate = parsed.range === 'custom' ? parsed.endDate! : dayInTimezone(now);
  let startDate: string | null;

  switch (parsed.range) {
    case '7d':
      startDate = addDays(endDate, -6);
      break;
    case '14d':
      startDate = addDays(endDate, -13);
      break;
    case '30d':
      startDate = addDays(endDate, -29);
      break;
    case '90d':
      startDate = addDays(endDate, -89);
      break;
    case 'year':
      startDate = `${endDate.slice(0, 4)}-01-01`;
      break;
    case 'custom':
      startDate = parsed.startDate!;
      break;
    case 'all':
      startDate = null;
      break;
  }

  const comparisonEndDate = startDate ? addDays(startDate, -1) : null;
  const comparisonStartDate =
    startDate && comparisonEndDate
      ? addDays(comparisonEndDate, -(inclusiveDays(startDate, endDate) - 1))
      : null;

  return {
    view: parsed.view,
    range: parsed.range,
    startDate,
    endDate,
    grain: parsed.grain,
    resolvedGrain: parsed.grain === 'auto' ? autoGrain(startDate, endDate) : parsed.grain,
    comparisonStartDate,
    comparisonEndDate,
  };
}

function statsInput(startDate: string | null, endDate: string): StatsFilters {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

function statsDashboard(input: StatsFilters): Promise<StatsDashboardData> {
  return getStatsDashboard(input) as Promise<StatsDashboardData>;
}

function economicsInput(startDate: string | null, endDate: string): ProfitTrackerRangeInput {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

function previousEconomicsInput(filters: Analytics2Filters) {
  return filters.comparisonStartDate && filters.comparisonEndDate
    ? economicsInput(filters.comparisonStartDate, filters.comparisonEndDate)
    : null;
}

function previousStatsInput(filters: Analytics2Filters) {
  return filters.comparisonStartDate && filters.comparisonEndDate
    ? statsInput(filters.comparisonStartDate, filters.comparisonEndDate)
    : null;
}

export function metricChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function metric(
  key: string,
  value: number | null,
  previous: number | null,
  unit: Analytics2Metric['unit'],
  goodWhen: Analytics2Metric['goodWhen'] = 'up',
): Analytics2Metric {
  return { key, value, previous, changePct: metricChange(value, previous), unit, goodWhen };
}

function datePredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  return sql`${startDate ? sql`${column} >= ${startDate}::date` : sql`true`}
    and ${column} <= ${endDate}::date`;
}

function timestampPredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  return sql`${startDate ? sql`(${column} at time zone 'Africa/Algiers')::date >= ${startDate}::date` : sql`true`}
    and (${column} at time zone 'Africa/Algiers')::date <= ${endDate}::date`;
}

function fridayWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const offset = (value.getUTCDay() - 5 + 7) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function bucketFor(date: string, grain: Analytics2ResolvedGrain) {
  if (grain === 'day') return date;
  if (grain === 'week') return fridayWeekStart(date);
  return `${date.slice(0, 7)}-01`;
}

function aggregateEconomicsSeries(
  report: EconomicsReport,
  grain: Analytics2ResolvedGrain,
  today: string,
): Analytics2EconomicsPoint[] {
  const realizedByDate = new Map(report.realized.days.map((day) => [day.date, day]));
  type Accumulator = {
    bucket: string;
    grossProfitDzd: number;
    grossSamples: number;
    adjustedProfitDzd: number;
    adjustedSamples: number;
    adCostDzd: number;
    adSamples: number;
    netProfitDzd: number;
    netSamples: number;
    trueProfitDzd: number;
    trueSamples: number;
    realizedProfitDzd: number;
    realizedSamples: number;
    realizedProfitAfterAdsDzd: number;
    realizedAfterAdsSamples: number;
    postedOrders: number;
    settledOrders: number;
    costCompleteOrders: number;
    days: string[];
  };
  const groups = new Map<string, Accumulator>();

  for (const day of [...report.days].reverse()) {
    const bucket = bucketFor(day.date, grain);
    const current = groups.get(bucket) ?? {
      bucket,
      grossProfitDzd: 0,
      grossSamples: 0,
      adjustedProfitDzd: 0,
      adjustedSamples: 0,
      adCostDzd: 0,
      adSamples: 0,
      netProfitDzd: 0,
      netSamples: 0,
      trueProfitDzd: 0,
      trueSamples: 0,
      realizedProfitDzd: 0,
      realizedSamples: 0,
      realizedProfitAfterAdsDzd: 0,
      realizedAfterAdsSamples: 0,
      postedOrders: 0,
      settledOrders: 0,
      costCompleteOrders: 0,
      days: [],
    };
    const realized = realizedByDate.get(day.date);
    current.days.push(day.date);
    current.postedOrders += day.postedOrders ?? 0;
    current.costCompleteOrders += day.costCompleteOrders ?? 0;
    current.settledOrders += realized?.settledOrders ?? 0;
    if (day.grossProfitDzd != null) {
      current.grossProfitDzd += day.grossProfitDzd;
      current.grossSamples += 1;
    }
    if (day.metrics.adjustedProfitDzd != null) {
      current.adjustedProfitDzd += day.metrics.adjustedProfitDzd;
      current.adjustedSamples += 1;
    }
    if (day.metrics.adCostDzd != null) {
      current.adCostDzd += day.metrics.adCostDzd;
      current.adSamples += 1;
    }
    if (day.metrics.netProfitDzd != null) {
      current.netProfitDzd += day.metrics.netProfitDzd;
      current.netSamples += 1;
    }
    if (day.trueProfitDzd != null) {
      current.trueProfitDzd += day.trueProfitDzd;
      current.trueSamples += 1;
    }
    if (realized) {
      current.realizedProfitDzd += realized.realizedProfitDzd;
      current.realizedSamples += 1;
      if (realized.realizedProfitAfterAdsDzd != null) {
        current.realizedProfitAfterAdsDzd += realized.realizedProfitAfterAdsDzd;
        current.realizedAfterAdsSamples += 1;
      }
    }
    groups.set(bucket, current);
  }

  let cumulativeNetProfitDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  let cumulativeRealizedProfitDzd = 0;
  return [...groups.values()]
    .sort((left, right) => left.bucket.localeCompare(right.bucket))
    .map((group) => {
      const grossProfitDzd = group.grossSamples ? group.grossProfitDzd : null;
      const adjustedProfitDzd = group.adjustedSamples ? group.adjustedProfitDzd : null;
      const adCostDzd = group.adSamples ? group.adCostDzd : null;
      const netProfitDzd = group.netSamples ? group.netProfitDzd : null;
      const trueProfitDzd = group.trueSamples ? group.trueProfitDzd : null;
      const realizedProfitDzd = group.realizedSamples ? group.realizedProfitDzd : null;
      if (netProfitDzd != null) cumulativeNetProfitDzd += netProfitDzd;
      if (trueProfitDzd != null) cumulativeTrueProfitDzd += trueProfitDzd;
      if (realizedProfitDzd != null) cumulativeRealizedProfitDzd += realizedProfitDzd;
      return {
        bucket: group.bucket,
        label: group.bucket,
        grossProfitDzd,
        adjustedProfitDzd,
        adCostDzd,
        netProfitDzd,
        trueProfitDzd,
        realizedProfitDzd,
        realizedProfitAfterAdsDzd: group.realizedAfterAdsSamples
          ? group.realizedProfitAfterAdsDzd
          : null,
        postedOrders: group.postedOrders,
        settledOrders: group.settledOrders,
        profitX:
          adjustedProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? adjustedProfitDzd / adCostDzd
            : null,
        profitXBeforeReturns:
          grossProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? grossProfitDzd / adCostDzd
            : null,
        projectedCoveragePct:
          group.postedOrders > 0 ? (group.costCompleteOrders / group.postedOrders) * 100 : null,
        cumulativeNetProfitDzd: group.netSamples ? cumulativeNetProfitDzd : null,
        cumulativeTrueProfitDzd: group.trueSamples ? cumulativeTrueProfitDzd : null,
        cumulativeRealizedProfitDzd: group.realizedSamples ? cumulativeRealizedProfitDzd : null,
        isPartial: group.days.includes(today),
      };
    });
}

export function aggregateAutomaticPaidSeries(
  report: Analytics2AutomaticPaidEconomics,
  grain: Analytics2ResolvedGrain,
) {
  const groups = new Map<string, Omit<Analytics2AutomaticPaidDay, 'date'> & { bucket: string }>();
  for (const day of report.days) {
    const bucket = bucketFor(day.date, grain);
    const current = groups.get(bucket) ?? {
      bucket,
      paidOrders: 0,
      codDzd: 0,
      feesDzd: 0,
      netRecoveredDzd: 0,
      productCostDzd: 0,
      profitDzd: 0,
      completeOrders: 0,
      providerAmountOrders: 0,
      legacyAmountOrders: 0,
      submittedAmountOrders: 0,
    };
    current.paidOrders += day.paidOrders;
    current.codDzd += day.codDzd;
    current.feesDzd += day.feesDzd;
    current.netRecoveredDzd += day.netRecoveredDzd;
    current.productCostDzd += day.productCostDzd;
    current.profitDzd += day.profitDzd;
    current.completeOrders += day.completeOrders;
    current.providerAmountOrders += day.providerAmountOrders;
    current.legacyAmountOrders += day.legacyAmountOrders;
    current.submittedAmountOrders += day.submittedAmountOrders;
    groups.set(bucket, current);
  }
  return [...groups.values()]
    .sort((left, right) => left.bucket.localeCompare(right.bucket))
    .map((row) => ({
      ...row,
      profitCoveragePct: ratio(row.completeOrders, row.paidOrders),
      providerAmountCoveragePct: ratio(row.providerAmountOrders, row.paidOrders),
    }));
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function returnRate(returned: number, paid: number) {
  return ratio(returned, returned + paid);
}

function fulfillmentPhase(status: string) {
  if (status === 'paye_et_archive') return 'paid';
  if (status.startsWith('retour')) return 'return';
  if (status === 'annule') return 'cancelled';
  if (
    status === 'livre_non_encaisse' ||
    status === 'encaisse_non_paye' ||
    status === 'paiements_prets'
  ) {
    return 'cash';
  }
  if (status === 'en_livraison') return 'delivery';
  if (
    status === 'vers_hub' ||
    status === 'en_hub' ||
    status === 'vers_wilaya' ||
    status === 'en_ramassage'
  ) {
    return 'transit';
  }
  if (status === 'prete_a_expedier' || status === 'en_preparation') return 'ready';
  return 'exception';
}

async function loadFulfillmentSummary(
  db: Database,
  startDate: string | null,
  endDate: string,
): Promise<Analytics2FulfillmentSummary & { matureCutoffDate: string }> {
  const matureCutoffDate = addDays(endDate, -21);
  const confirmedStatuses = sql.join(
    [...CONFIRMED_LIFECYCLE_ORDER_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), posted_cohort as (
      select first_posted.order_id,
        first_posted.posted_day,
        coalesce(${ecotrackOrderStates.currentStatus}, '') as current_status
      from first_posted
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    ), order_cohort as (
      select ${orders.id}, ${orders.confirmed}
      from ${orders}
      where ${timestampPredicate(orders.createdAt, startDate, endDate)}
    )
    select
      (select count(*)::int from order_cohort) as submitted_orders,
      (select count(*) filter (where confirmed in (${confirmedStatuses}))::int from order_cohort)
        as confirmed_orders,
      count(*)::int as posted_orders,
      count(*) filter (
        where current_status not in ('paye_et_archive', 'retour_archive', 'annule')
      )::int as active_shipments,
      count(*) filter (
        where current_status in (
          'livre_non_encaisse', 'encaisse_non_paye', 'paiements_prets', 'paye_et_archive'
        )
      )::int as delivered_orders,
      count(*) filter (where current_status = 'paye_et_archive')::int as paid_orders,
      count(*) filter (where current_status = 'retour_archive')::int as returned_orders,
      count(*) filter (where current_status = 'annule')::int as cancelled_orders,
      count(*) filter (where current_status in ('paye_et_archive', 'retour_archive'))::int
        as terminal_orders,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'paye_et_archive'
      )::int as mature_paid_orders,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'retour_archive'
      )::int as mature_returned_orders
    from posted_cohort
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const paidOrders = numeric(row.paid_orders);
  const returnedOrders = numeric(row.returned_orders);
  const maturePaid = numeric(row.mature_paid_orders);
  const matureReturned = numeric(row.mature_returned_orders);
  return {
    submittedOrders: numeric(row.submitted_orders),
    confirmedOrders: numeric(row.confirmed_orders),
    postedOrders: numeric(row.posted_orders),
    activeShipments: numeric(row.active_shipments),
    deliveredOrders: numeric(row.delivered_orders),
    paidOrders,
    returnedOrders,
    cancelledOrders: numeric(row.cancelled_orders),
    terminalOrders: numeric(row.terminal_orders),
    observedReturnRatePct: returnRate(returnedOrders, paidOrders),
    matureObservedReturnRatePct: returnRate(matureReturned, maturePaid),
    matureCutoffDate,
  };
}

async function loadReturnObservation(
  db: Database,
  filters: Analytics2Filters,
  planningRatePct: number,
): Promise<Analytics2ReturnObservation> {
  const summary = await loadFulfillmentSummary(db, filters.startDate, filters.endDate);
  const matureCutoffDate = summary.matureCutoffDate;
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), cohort as (
      select first_posted.posted_day,
        ${ecotrackOrderStates.currentStatus} as current_status
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    )
    select
      count(*) filter (where current_status = 'paye_et_archive')::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'paye_et_archive'
      )::int as mature_paid,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'retour_archive'
      )::int as mature_returned
    from cohort
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const paid = numeric(row.paid);
  const returned = numeric(row.returned);
  const maturePaid = numeric(row.mature_paid);
  const matureReturned = numeric(row.mature_returned);
  return {
    planningRatePct,
    mature: {
      ratePct: returnRate(matureReturned, maturePaid),
      paid: maturePaid,
      returned: matureReturned,
      terminal: maturePaid + matureReturned,
      cutoffDate: matureCutoffDate,
    },
    allTerminal: {
      ratePct: returnRate(returned, paid),
      paid,
      returned,
      terminal: paid + returned,
    },
  };
}

export async function loadAutomaticPaidEconomics(
  db: Database,
  filters: Analytics2Filters,
): Promise<Analytics2AutomaticPaidEconomics> {
  const result = await db.execute(sql`
    with paid_events as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as paid_at
      from ${ecotrackOrderTrackingEvents}
      where ${ecotrackOrderTrackingEvents.status} = 'payed'
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), paid_observations as (
      select ${ecotrackOrderStatusObservations.orderId} as order_id,
        min(coalesce(
          ${ecotrackOrderStatusObservations.effectiveAt},
          ${ecotrackOrderStatusObservations.firstObservedAt}
        )) as paid_at
      from ${ecotrackOrderStatusObservations}
      where ${ecotrackOrderStatusObservations.status} = 'paye_et_archive'
      group by ${ecotrackOrderStatusObservations.orderId}
    ), paid_local as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        ${orderStatusHistory.changedAt} as paid_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 4
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        sum(
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
        )::double precision as product_cost
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), paid as (
      select ${ecotrackOrderStates.orderId} as order_id,
        coalesce(
          paid_events.paid_at,
          paid_observations.paid_at,
          paid_local.paid_at,
          ${ecotrackOrderStates.providerUpdatedAt},
          ${ecotrackOrderStates.updatedAt}
        ) as paid_at,
        case
          when ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
            and ${ecotrackOrderStates.currentAmount} is not null
            then ${ecotrackOrderStates.currentAmount}::double precision
          when ${processedOrders.id} is not null
            then (${processedOrders.netRevenue} + ${processedOrders.totalFees})::double precision
          when ${ecotrackOrderStates.currentAmount} is not null
            then ${ecotrackOrderStates.currentAmount}::double precision
          else ${orders.totalAmount}::double precision
        end as cod_amount,
        case
          when ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
            and ${ecotrackOrderStates.currentAmount} is not null then 'provider'
          when ${processedOrders.id} is not null then 'legacy'
          when ${ecotrackOrderStates.currentAmount} is not null or ${orders.totalAmount} is not null
            then 'submitted'
          else 'missing'
        end as amount_source,
        coalesce(
          ${ecotrackOrderStates.deliveryTariff}::double precision,
          ${ecotrackOrderStates.estimatedFee}::double precision,
          ${processedOrders.totalFees}::double precision
        ) as fee_amount,
        line_economics.cost_complete,
        line_economics.product_cost
      from ${ecotrackOrderStates}
      inner join ${orders} on ${orders.id} = ${ecotrackOrderStates.orderId}
      left join paid_events on paid_events.order_id = ${ecotrackOrderStates.orderId}
      left join paid_observations on paid_observations.order_id = ${ecotrackOrderStates.orderId}
      left join paid_local on paid_local.order_id = ${ecotrackOrderStates.orderId}
      left join line_economics on line_economics.order_id = ${ecotrackOrderStates.orderId}
      left join ${processedOrders}
        on ${processedOrders.tracking} = ${ecotrackOrderStates.trackingNumber}
      where ${ecotrackOrderStates.deletedAt} is null
        and ${ecotrackOrderStates.currentStatus} = 'paye_et_archive'
    )
    select (paid_at at time zone 'Africa/Algiers')::date::text as day,
      count(*)::int as paid_orders,
      coalesce(sum(cod_amount) filter (where cod_amount is not null), 0)::double precision as cod,
      coalesce(sum(fee_amount) filter (where fee_amount is not null), 0)::double precision as fees,
      coalesce(sum(cod_amount - fee_amount)
        filter (where cod_amount is not null and fee_amount is not null), 0)::double precision
        as net_recovered,
      coalesce(sum(product_cost) filter (where cost_complete), 0)::double precision as product_cost,
      coalesce(sum(cod_amount - fee_amount - product_cost) filter (
        where cod_amount is not null and fee_amount is not null and cost_complete
      ), 0)::double precision as profit,
      count(*) filter (
        where cod_amount is not null and fee_amount is not null and cost_complete
      )::int as complete_orders,
      count(*) filter (where amount_source = 'provider')::int as provider_amount_orders,
      count(*) filter (where amount_source = 'legacy')::int as legacy_amount_orders,
      count(*) filter (where amount_source = 'submitted')::int as submitted_amount_orders
    from paid
    where paid_at is not null
      and ${datePredicate(
        sql`(paid_at at time zone 'Africa/Algiers')::date`,
        filters.startDate,
        filters.endDate,
      )}
    group by (paid_at at time zone 'Africa/Algiers')::date
    order by (paid_at at time zone 'Africa/Algiers')::date
  `);
  const days: Analytics2AutomaticPaidDay[] = Array.from(
    result.rows as Iterable<unknown>,
    (raw): Analytics2AutomaticPaidDay => {
      const row = raw as Record<string, unknown>;
      return {
        date: String(row.day),
        paidOrders: numeric(row.paid_orders),
        codDzd: numeric(row.cod),
        feesDzd: numeric(row.fees),
        netRecoveredDzd: numeric(row.net_recovered),
        productCostDzd: numeric(row.product_cost),
        profitDzd: numeric(row.profit),
        completeOrders: numeric(row.complete_orders),
        providerAmountOrders: numeric(row.provider_amount_orders),
        legacyAmountOrders: numeric(row.legacy_amount_orders),
        submittedAmountOrders: numeric(row.submitted_amount_orders),
      };
    },
  );
  type PaidAccumulator = Omit<
    Analytics2AutomaticPaidEconomics['summary'],
    'profitCoveragePct' | 'providerAmountCoveragePct'
  > & { providerAmountOrders: number };
  const summary = days.reduce<PaidAccumulator>(
    (current: PaidAccumulator, day: Analytics2AutomaticPaidDay) => ({
      paidOrders: current.paidOrders + day.paidOrders,
      codDzd: current.codDzd + day.codDzd,
      feesDzd: current.feesDzd + day.feesDzd,
      netRecoveredDzd: current.netRecoveredDzd + day.netRecoveredDzd,
      productCostDzd: current.productCostDzd + day.productCostDzd,
      profitDzd: current.profitDzd + day.profitDzd,
      completeOrders: current.completeOrders + day.completeOrders,
      providerAmountOrders: current.providerAmountOrders + day.providerAmountOrders,
      legacyFallbackOrders: current.legacyFallbackOrders + day.legacyAmountOrders,
      submittedFallbackOrders: current.submittedFallbackOrders + day.submittedAmountOrders,
    }),
    {
      paidOrders: 0,
      codDzd: 0,
      feesDzd: 0,
      netRecoveredDzd: 0,
      productCostDzd: 0,
      profitDzd: 0,
      completeOrders: 0,
      providerAmountOrders: 0,
      legacyFallbackOrders: 0,
      submittedFallbackOrders: 0,
    },
  );
  const { providerAmountOrders, ...publicSummary } = summary;
  return {
    summary: {
      ...publicSummary,
      profitCoveragePct: ratio(summary.completeOrders, summary.paidOrders),
      providerAmountCoveragePct: ratio(providerAmountOrders, summary.paidOrders),
    },
    days,
  };
}

export type Analytics2CashStage = {
  key:
    | 'inTransit'
    | 'deliveredAwaitingCollection'
    | 'collectedAwaitingPayout'
    | 'paymentReady'
    | 'paid';
  orders: number;
  amountDzd: number;
  providerAmountCoveragePct: number | null;
  medianAgeHours: number | null;
  oldestAgeHours: number | null;
  staleOrders: number;
};

export type Analytics2FulfillmentException = {
  orderId: number;
  reference: string;
  trackingNumber: string;
  status: string;
  reason: string;
  postponedTo: string | null;
  ageHours: number | null;
  amountDzd: number | null;
  overdue: boolean;
};

async function loadCashPipeline(
  db: Database,
  filters: Analytics2Filters,
): Promise<Analytics2CashStage[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), latest_stage_observation as (
      select distinct on (
        ${ecotrackOrderStatusObservations.orderId},
        ${ecotrackOrderStatusObservations.status}
      )
        ${ecotrackOrderStatusObservations.orderId} as order_id,
        ${ecotrackOrderStatusObservations.status} as status,
        coalesce(
          ${ecotrackOrderStatusObservations.effectiveAt},
          ${ecotrackOrderStatusObservations.firstObservedAt}
        ) as stage_at
      from ${ecotrackOrderStatusObservations}
      order by ${ecotrackOrderStatusObservations.orderId},
        ${ecotrackOrderStatusObservations.status},
        ${ecotrackOrderStatusObservations.firstObservedAt} desc
    ), pipeline as (
      select case
          when ${ecotrackOrderStates.currentStatus} in (
            'prete_a_expedier', 'en_ramassage', 'en_preparation_stock', 'en_preparation',
            'vers_hub', 'en_hub', 'vers_wilaya', 'en_livraison', 'suspendu'
          ) then 'inTransit'
          when ${ecotrackOrderStates.currentStatus} = 'livre_non_encaisse'
            then 'deliveredAwaitingCollection'
          when ${ecotrackOrderStates.currentStatus} = 'encaisse_non_paye'
            then 'collectedAwaitingPayout'
          when ${ecotrackOrderStates.currentStatus} = 'paiements_prets' then 'paymentReady'
          when ${ecotrackOrderStates.currentStatus} = 'paye_et_archive' then 'paid'
          else null
        end as stage,
        coalesce(
          ${ecotrackOrderStates.currentAmount}::double precision,
          ${orders.totalAmount}::double precision
        ) as amount,
        ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders' as provider_amount,
        coalesce(
          latest_stage_observation.stage_at,
          ${ecotrackOrderStates.lastActionAt},
          ${ecotrackOrderStates.lastStatusSyncedAt},
          ${ecotrackOrderStates.updatedAt}
        ) as stage_at,
        least(now(), (${filters.endDate}::date + interval '1 day')) as reference_at
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join latest_stage_observation
        on latest_stage_observation.order_id = ${ecotrackOrderStates.orderId}
        and latest_stage_observation.status = ${ecotrackOrderStates.currentStatus}
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    )
    select stage,
      count(*)::int as orders,
      coalesce(sum(amount), 0)::double precision as amount,
      count(*) filter (where provider_amount)::int as provider_amount_orders,
      percentile_cont(0.5) within group (
        order by extract(epoch from (reference_at - stage_at)) / 3600
      )::double precision as median_age_hours,
      max(extract(epoch from (reference_at - stage_at)) / 3600)::double precision
        as oldest_age_hours,
      count(*) filter (
        where stage <> 'paid'
          and reference_at - stage_at > interval '48 hours'
      )::int
        as stale_orders
    from pipeline
    where stage is not null
    group by stage
  `);
  const order: Analytics2CashStage['key'][] = [
    'inTransit',
    'deliveredAwaitingCollection',
    'collectedAwaitingPayout',
    'paymentReady',
    'paid',
  ];
  const rows = new Map<Analytics2CashStage['key'], Analytics2CashStage>();
  for (const raw of result.rows as Iterable<unknown>) {
    const row = raw as Record<string, unknown>;
    const ordersCount = numeric(row.orders);
    const key = String(row.stage) as Analytics2CashStage['key'];
    rows.set(key, {
      key,
      orders: ordersCount,
      amountDzd: numeric(row.amount),
      providerAmountCoveragePct: ratio(numeric(row.provider_amount_orders), ordersCount),
      medianAgeHours: nullableNumeric(row.median_age_hours),
      oldestAgeHours: nullableNumeric(row.oldest_age_hours),
      staleOrders: numeric(row.stale_orders),
    });
  }
  return order.map(
    (key) =>
      rows.get(key) ?? {
        key,
        orders: 0,
        amountDzd: 0,
        providerAmountCoveragePct: null,
        medianAgeHours: null,
        oldestAgeHours: null,
        staleOrders: 0,
      },
  );
}

async function loadFulfillmentExceptions(
  db: Database,
  filters: Analytics2Filters,
): Promise<{
  rows: Analytics2FulfillmentException[];
  reasons: Array<{ reason: string; orders: number }>;
}> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), latest_activity as (
      select distinct on (${ecotrackOrderActivities.orderId})
        ${ecotrackOrderActivities.orderId} as order_id,
        coalesce(
          nullif(${ecotrackOrderActivities.reason}, ''),
          nullif(${ecotrackOrderActivities.details}, '')
        ) as reason,
        ${ecotrackOrderActivities.postponedTo} as postponed_to,
        coalesce(
          ${ecotrackOrderActivities.effectiveAt},
          ${ecotrackOrderActivities.firstObservedAt}
        ) as activity_at
      from ${ecotrackOrderActivities}
      order by ${ecotrackOrderActivities.orderId},
        coalesce(
          ${ecotrackOrderActivities.effectiveAt},
          ${ecotrackOrderActivities.firstObservedAt}
        ) desc,
        ${ecotrackOrderActivities.id} desc
    )
    select ${orders.id} as order_id,
      ${ecotrackOrderStates.reference} as reference,
      ${ecotrackOrderStates.trackingNumber} as tracking_number,
      ${ecotrackOrderStates.currentStatus} as status,
      coalesce(
        nullif(${ecotrackOrderStates.statusReason}, ''),
        latest_activity.reason,
        case when ${ecotrackOrderStates.currentStatus} = 'suspendu' then 'Suspended' end,
        'Stale shipment'
      ) as reason,
      latest_activity.postponed_to,
      extract(epoch from (
        least(now(), (${filters.endDate}::date + interval '1 day'))
        - coalesce(
          latest_activity.activity_at,
          ${ecotrackOrderStates.lastStatusSyncedAt},
          ${ecotrackOrderStates.updatedAt}
        )
      )) / 3600 as age_hours,
      coalesce(
        ${ecotrackOrderStates.currentAmount}::double precision,
        ${orders.totalAmount}::double precision
      ) as amount
    from first_posted
    inner join ${orders} on ${orders.id} = first_posted.order_id
    inner join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    left join latest_activity on latest_activity.order_id = first_posted.order_id
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
      and ${ecotrackOrderStates.currentStatus} not in (
        'paye_et_archive', 'retour_archive', 'annule'
      )
      and (
        nullif(${ecotrackOrderStates.statusReason}, '') is not null
        or latest_activity.reason is not null
        or latest_activity.postponed_to is not null
        or ${ecotrackOrderStates.currentStatus} = 'suspendu'
        or least(now(), (${filters.endDate}::date + interval '1 day'))
          - coalesce(
            latest_activity.activity_at,
            ${ecotrackOrderStates.lastStatusSyncedAt},
            ${ecotrackOrderStates.updatedAt}
          ) >= interval '48 hours'
      )
    order by
      (latest_activity.postponed_to is not null
        and latest_activity.postponed_to < ${filters.endDate}::date) desc,
      age_hours desc nulls last
    limit 80
  `);
  const rows = Array.from(
    result.rows as Iterable<unknown>,
    (raw): Analytics2FulfillmentException => {
      const row = raw as Record<string, unknown>;
      const postponedTo = row.postponed_to ? String(row.postponed_to).slice(0, 10) : null;
      return {
        orderId: numeric(row.order_id),
        reference: String(row.reference),
        trackingNumber: String(row.tracking_number),
        status: String(row.status),
        reason: String(row.reason),
        postponedTo,
        ageHours: nullableNumeric(row.age_hours),
        amountDzd: nullableNumeric(row.amount),
        overdue: Boolean(postponedTo && postponedTo < filters.endDate),
      };
    },
  );
  const reasonCounts = new Map<string, number>();
  for (const row of rows) reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  return {
    rows,
    reasons: [...reasonCounts.entries()]
      .map(([reason, ordersCount]) => ({ reason, orders: ordersCount }))
      .sort((left, right) => right.orders - left.orders || left.reason.localeCompare(right.reason))
      .slice(0, 10),
  };
}

type FulfillmentStateRow = {
  status: string;
  phase: string;
  orders: number;
  sharePct: number;
  staleOrders: number;
  medianAgeHours: number | null;
  oldestActivityAt: string | null;
};

async function loadFulfillmentStates(
  db: Database,
  startDate: string | null,
  endDate: string,
): Promise<FulfillmentStateRow[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), cohort as (
      select ${ecotrackOrderStates.currentStatus} as current_status,
        coalesce(
          ${ecotrackOrderStates.lastActionAt},
          ${ecotrackOrderStates.lastStatusSyncedAt},
          ${ecotrackOrderStates.updatedAt}
        ) as activity_at,
        least(now(), (${endDate}::date + interval '1 day')) as reference_at
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    )
    select current_status,
      count(*)::int as orders,
      count(*) filter (
        where current_status not in ('paye_et_archive', 'retour_archive', 'annule')
          and reference_at - activity_at > interval '48 hours'
      )::int as stale_orders,
      percentile_cont(0.5) within group (
        order by extract(epoch from (reference_at - activity_at)) / 3600
      ) filter (
        where current_status not in ('paye_et_archive', 'retour_archive', 'annule')
      )::double precision as median_age_hours,
      min(activity_at) filter (
        where current_status not in ('paye_et_archive', 'retour_archive', 'annule')
      ) as oldest_activity_at
    from cohort
    group by current_status
    order by count(*) desc, current_status
  `);
  const total = result.rows.reduce(
    (sum: number, raw: unknown) => sum + numeric((raw as Record<string, unknown>).orders),
    0,
  );
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    const ordersCount = numeric(row.orders);
    const status = String(row.current_status || 'unknown');
    return {
      status,
      phase: fulfillmentPhase(status),
      orders: ordersCount,
      sharePct: total > 0 ? (ordersCount / total) * 100 : 0,
      staleOrders: numeric(row.stale_orders),
      medianAgeHours: nullableNumeric(row.median_age_hours),
      oldestActivityAt: isoValue(row.oldest_activity_at),
    };
  });
}

type FulfillmentCycleMetric = {
  key: 'carrierToAttempt' | 'carrierToDelivery' | 'deliveryToPayment';
  medianHours: number | null;
  p75Hours: number | null;
  p90Hours: number | null;
  samples: number;
};

async function loadFulfillmentCycleMetrics(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), events as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        ${ecotrackOrderTrackingEvents.status} as status,
        (${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time) as event_at
      from ${ecotrackOrderTrackingEvents}
      inner join first_posted
        on first_posted.order_id = ${ecotrackOrderTrackingEvents.orderId}
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    ), moments as (
      select order_id,
        min(event_at) filter (where status = 'accepted_by_carrier') as accepted_at,
        min(event_at) filter (where status = 'attempt_delivery') as first_attempt_at,
        min(event_at) filter (where status = 'livred') as delivered_at,
        min(event_at) filter (where status = 'payed') as paid_at
      from events
      group by order_id
    ), durations as (
      select
        case when first_attempt_at >= accepted_at
          then extract(epoch from (first_attempt_at - accepted_at)) / 3600 end
          as carrier_to_attempt,
        case when delivered_at >= accepted_at
          then extract(epoch from (delivered_at - accepted_at)) / 3600 end
          as carrier_to_delivery,
        case when paid_at >= delivered_at
          then extract(epoch from (paid_at - delivered_at)) / 3600 end
          as delivery_to_payment
      from moments
    )
    select
      percentile_cont(0.5) within group (order by carrier_to_attempt)
        filter (where carrier_to_attempt is not null)::double precision as attempt_p50,
      percentile_cont(0.75) within group (order by carrier_to_attempt)
        filter (where carrier_to_attempt is not null)::double precision as attempt_p75,
      percentile_cont(0.9) within group (order by carrier_to_attempt)
        filter (where carrier_to_attempt is not null)::double precision as attempt_p90,
      count(carrier_to_attempt)::int as attempt_samples,
      percentile_cont(0.5) within group (order by carrier_to_delivery)
        filter (where carrier_to_delivery is not null)::double precision as delivery_p50,
      percentile_cont(0.75) within group (order by carrier_to_delivery)
        filter (where carrier_to_delivery is not null)::double precision as delivery_p75,
      percentile_cont(0.9) within group (order by carrier_to_delivery)
        filter (where carrier_to_delivery is not null)::double precision as delivery_p90,
      count(carrier_to_delivery)::int as delivery_samples,
      percentile_cont(0.5) within group (order by delivery_to_payment)
        filter (where delivery_to_payment is not null)::double precision as payment_p50,
      percentile_cont(0.75) within group (order by delivery_to_payment)
        filter (where delivery_to_payment is not null)::double precision as payment_p75,
      percentile_cont(0.9) within group (order by delivery_to_payment)
        filter (where delivery_to_payment is not null)::double precision as payment_p90,
      count(delivery_to_payment)::int as payment_samples
    from durations
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return [
    {
      key: 'carrierToAttempt',
      medianHours: nullableNumeric(row.attempt_p50),
      p75Hours: nullableNumeric(row.attempt_p75),
      p90Hours: nullableNumeric(row.attempt_p90),
      samples: numeric(row.attempt_samples),
    },
    {
      key: 'carrierToDelivery',
      medianHours: nullableNumeric(row.delivery_p50),
      p75Hours: nullableNumeric(row.delivery_p75),
      p90Hours: nullableNumeric(row.delivery_p90),
      samples: numeric(row.delivery_samples),
    },
    {
      key: 'deliveryToPayment',
      medianHours: nullableNumeric(row.payment_p50),
      p75Hours: nullableNumeric(row.payment_p75),
      p90Hours: nullableNumeric(row.payment_p90),
      samples: numeric(row.payment_samples),
    },
  ] satisfies FulfillmentCycleMetric[];
}

async function loadAttemptDistribution(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), attempts as (
      select first_posted.order_id,
        count(${ecotrackOrderTrackingEvents.id}) filter (
          where ${ecotrackOrderTrackingEvents.status} = 'attempt_delivery'
        )::int as attempts,
        ${ecotrackOrderStates.currentStatus} as outcome
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join ${ecotrackOrderTrackingEvents}
        on ${ecotrackOrderTrackingEvents.orderId} = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
        and ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'retour_archive')
      group by first_posted.order_id, ${ecotrackOrderStates.currentStatus}
    )
    select outcome,
      case when attempts >= 4 then '4+' else attempts::text end as attempt_band,
      count(*)::int as orders,
      avg(attempts)::double precision as average_attempts
    from attempts
    group by outcome, case when attempts >= 4 then '4+' else attempts::text end
    order by outcome, attempt_band
  `);
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    return {
      outcome: String(row.outcome) === 'retour_archive' ? 'returned' : 'paid',
      band: String(row.attempt_band),
      orders: numeric(row.orders),
      averageAttempts: numeric(row.average_attempts),
    };
  });
}

async function loadFulfillmentTrend(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    select ${ecotrackOrderTrackingEvents.eventDate}::text as day,
      count(distinct ${ecotrackOrderTrackingEvents.orderId}) filter (
        where ${ecotrackOrderTrackingEvents.status} = 'accepted_by_carrier'
      )::int as accepted,
      count(distinct ${ecotrackOrderTrackingEvents.orderId}) filter (
        where ${ecotrackOrderTrackingEvents.status} = 'attempt_delivery'
      )::int as attempted,
      count(distinct ${ecotrackOrderTrackingEvents.orderId}) filter (
        where ${ecotrackOrderTrackingEvents.status} = 'livred'
      )::int as delivered,
      count(distinct ${ecotrackOrderTrackingEvents.orderId}) filter (
        where ${ecotrackOrderTrackingEvents.status} = 'payed'
      )::int as paid,
      count(distinct ${ecotrackOrderTrackingEvents.orderId}) filter (
        where ${ecotrackOrderTrackingEvents.status} = 'returned'
      )::int as returned
    from ${ecotrackOrderTrackingEvents}
    where ${datePredicate(ecotrackOrderTrackingEvents.eventDate, startDate, endDate)}
    group by ${ecotrackOrderTrackingEvents.eventDate}
    order by ${ecotrackOrderTrackingEvents.eventDate}
  `);
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    return {
      day: String(row.day),
      accepted: numeric(row.accepted),
      attempted: numeric(row.attempted),
      delivered: numeric(row.delivered),
      paid: numeric(row.paid),
      returned: numeric(row.returned),
    };
  });
}

async function loadFulfillmentCohorts(
  db: Database,
  startDate: string | null,
  endDate: string,
  planningReturnRatePct: number,
) {
  const matureCutoffDate = addDays(endDate, -21);
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), delivered as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as delivered_at
      from ${ecotrackOrderTrackingEvents}
      where ${ecotrackOrderTrackingEvents.status} = 'livred'
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        sum(${orderLineItems.lineTotal})::double precision as product_revenue,
        sum(
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
        )::double precision as product_cost
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), cohort as (
      select (
          first_posted.posted_day
          - (((extract(dow from first_posted.posted_day)::int - 5 + 7) % 7))::int
        )::date as week_start,
        first_posted.posted_day,
        coalesce(${ecotrackOrderStates.currentStatus}, '') as current_status,
        delivered.delivered_at,
        line_economics.cost_complete,
        case when line_economics.cost_complete then
          (line_economics.product_revenue - line_economics.product_cost)
          * (1 - ${planningReturnRatePct}::double precision / 100)
        end as projected_contribution,
        case when line_economics.cost_complete
          and coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) is not null
          and coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) is not null
        then coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) - coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) - line_economics.product_cost
        end as automatic_profit
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join delivered on delivered.order_id = first_posted.order_id
      left join line_economics on line_economics.order_id = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    )
    select week_start::text,
      count(*)::int as posted,
      count(*) filter (where current_status = 'paye_et_archive')::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (where delivered_at is not null)::int as delivered,
      count(*) filter (
        where current_status not in ('paye_et_archive', 'retour_archive', 'annule')
      )::int as active,
      coalesce(sum(projected_contribution), 0)::double precision as projected_contribution,
      coalesce(sum(automatic_profit) filter (where delivered_at is not null), 0)::double precision
        as delivered_contribution,
      coalesce(sum(automatic_profit) filter (where current_status = 'paye_et_archive'), 0)
        ::double precision as paid_automatic_profit,
      count(*) filter (where cost_complete)::int as cost_complete_orders,
      bool_and(posted_day <= ${matureCutoffDate}::date) as mature
    from cohort
    group by week_start
    order by week_start desc
    limit 18
  `);
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    const paid = numeric(row.paid);
    const returned = numeric(row.returned);
    return {
      weekStart: String(row.week_start),
      posted: numeric(row.posted),
      paid,
      returned,
      delivered: numeric(row.delivered),
      active: numeric(row.active),
      observedReturnRatePct: returnRate(returned, paid),
      projectedContributionDzd: numeric(row.projected_contribution),
      deliveredContributionDzd: numeric(row.delivered_contribution),
      paidAutomaticProfitDzd: numeric(row.paid_automatic_profit),
      varianceDzd: numeric(row.paid_automatic_profit) - numeric(row.projected_contribution),
      costCoveragePct: ratio(numeric(row.cost_complete_orders), numeric(row.posted)),
      mature: Boolean(row.mature),
    };
  });
}

async function loadFulfillmentData(
  db: Database,
  filters: Analytics2Filters,
  planningReturnRatePct: number,
) {
  const [summary, states, cycleTimes, attempts, trend, cohorts, cashPipeline, exceptions] =
    await Promise.all([
      loadFulfillmentSummary(db, filters.startDate, filters.endDate),
      loadFulfillmentStates(db, filters.startDate, filters.endDate),
      loadFulfillmentCycleMetrics(db, filters.startDate, filters.endDate),
      loadAttemptDistribution(db, filters.startDate, filters.endDate),
      loadFulfillmentTrend(db, filters.startDate, filters.endDate),
      loadFulfillmentCohorts(db, filters.startDate, filters.endDate, planningReturnRatePct),
      loadCashPipeline(db, filters),
      loadFulfillmentExceptions(db, filters),
    ]);
  return { summary, states, cycleTimes, attempts, trend, cohorts, cashPipeline, exceptions };
}

type MetaDailyRow = {
  day: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spendEur: number;
  adCostDzd: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  uniqueOutboundClicks: number;
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;
  metaPurchases: number;
  purchaseValue: number;
  videoPlays: number;
  videoP25Watched: number;
  videoP50Watched: number;
  videoP75Watched: number;
  videoP95Watched: number;
  videoP100Watched: number;
  videoAverageWatchSeconds: number;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
};

type MetaOutcomeRow = {
  campaignId: string | null;
  adsetId: string | null;
  adId: string;
  bricOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
};

type MetaEntityAccumulator = Omit<
  Analytics2MetaEntity,
  | 'ctrPct'
  | 'outboundCtrPct'
  | 'landingViewRatePct'
  | 'cpmEur'
  | 'videoPlayRatePct'
  | 'videoCompletionRatePct'
  | 'videoAverageWatchSeconds'
  | 'costPerPostedDzd'
  | 'costPerConfirmedDzd'
  | 'costPerDeliveredDzd'
  | 'costPerPaidDzd'
  | 'platformRoas'
> & { videoWatchSecondsWeighted: number };

function emptyMetaEntity(
  level: Analytics2EntityLevel,
  row: Pick<
    MetaDailyRow,
    'campaignId' | 'campaignName' | 'adsetId' | 'adsetName' | 'adId' | 'adName'
  >,
): MetaEntityAccumulator {
  const id = level === 'campaign' ? row.campaignId : level === 'adset' ? row.adsetId : row.adId;
  const name =
    level === 'campaign' ? row.campaignName : level === 'adset' ? row.adsetName : row.adName;
  return {
    id,
    name: name || id,
    campaignId: row.campaignId || null,
    campaignName: row.campaignName || null,
    adsetId: level === 'campaign' ? null : row.adsetId || null,
    adsetName: level === 'campaign' ? null : row.adsetName || null,
    spendEur: 0,
    adCostDzd: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    outboundClicks: 0,
    uniqueOutboundClicks: 0,
    landingPageViews: 0,
    addToCarts: 0,
    checkouts: 0,
    metaPurchases: 0,
    purchaseValue: 0,
    videoPlays: 0,
    videoP25Watched: 0,
    videoP50Watched: 0,
    videoP75Watched: 0,
    videoP95Watched: 0,
    videoP100Watched: 0,
    videoWatchSecondsWeighted: 0,
    qualityRanking: null,
    engagementRateRanking: null,
    conversionRateRanking: null,
    bricOrders: 0,
    confirmedOrders: 0,
    postedOrders: 0,
    deliveredOrders: 0,
    paidOrders: 0,
    returnedOrders: 0,
  };
}

function finalizeMetaEntity(row: MetaEntityAccumulator): Analytics2MetaEntity {
  const { videoWatchSecondsWeighted, ...publicRow } = row;
  return {
    ...publicRow,
    ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
    outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
    landingViewRatePct:
      row.outboundClicks > 0 ? (row.landingPageViews / row.outboundClicks) * 100 : null,
    cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    videoPlayRatePct: row.impressions > 0 ? (row.videoPlays / row.impressions) * 100 : null,
    videoCompletionRatePct:
      row.videoPlays > 0 ? (row.videoP100Watched / row.videoPlays) * 100 : null,
    videoAverageWatchSeconds:
      row.videoPlays > 0 ? videoWatchSecondsWeighted / row.videoPlays : null,
    costPerPostedDzd: row.postedOrders > 0 ? row.adCostDzd / row.postedOrders : null,
    costPerConfirmedDzd: row.confirmedOrders > 0 ? row.adCostDzd / row.confirmedOrders : null,
    costPerDeliveredDzd: row.deliveredOrders > 0 ? row.adCostDzd / row.deliveredOrders : null,
    costPerPaidDzd: row.paidOrders > 0 ? row.adCostDzd / row.paidOrders : null,
    platformRoas: row.spendEur > 0 ? row.purchaseValue / row.spendEur : null,
  };
}

function groupMetaEntities(
  level: Analytics2EntityLevel,
  daily: MetaDailyRow[],
  outcomes: MetaOutcomeRow[],
) {
  const rows = new Map<string, MetaEntityAccumulator>();
  const namesByAdId = new Map(daily.map((row) => [row.adId, row]));

  for (const day of daily) {
    const id = level === 'campaign' ? day.campaignId : level === 'adset' ? day.adsetId : day.adId;
    const current = rows.get(id) ?? emptyMetaEntity(level, day);
    current.spendEur += day.spendEur;
    current.adCostDzd += day.adCostDzd;
    current.impressions += day.impressions;
    current.clicks += day.clicks;
    current.linkClicks += day.linkClicks;
    current.outboundClicks += day.outboundClicks;
    current.uniqueOutboundClicks += day.uniqueOutboundClicks;
    current.landingPageViews += day.landingPageViews;
    current.addToCarts += day.addToCarts;
    current.checkouts += day.checkouts;
    current.metaPurchases += day.metaPurchases;
    current.purchaseValue += day.purchaseValue;
    current.videoPlays += day.videoPlays;
    current.videoP25Watched += day.videoP25Watched;
    current.videoP50Watched += day.videoP50Watched;
    current.videoP75Watched += day.videoP75Watched;
    current.videoP95Watched += day.videoP95Watched;
    current.videoP100Watched += day.videoP100Watched;
    current.videoWatchSecondsWeighted += day.videoAverageWatchSeconds * day.videoPlays;
    if (day.qualityRanking) current.qualityRanking = day.qualityRanking;
    if (day.engagementRateRanking) current.engagementRateRanking = day.engagementRateRanking;
    if (day.conversionRateRanking) current.conversionRateRanking = day.conversionRateRanking;
    rows.set(id, current);
  }

  for (const outcome of outcomes) {
    const id =
      level === 'campaign'
        ? outcome.campaignId
        : level === 'adset'
          ? outcome.adsetId
          : outcome.adId;
    if (!id) continue;
    const reference = namesByAdId.get(outcome.adId) ?? {
      campaignId: outcome.campaignId ?? '',
      campaignName: outcome.campaignId ?? '',
      adsetId: outcome.adsetId ?? '',
      adsetName: outcome.adsetId ?? '',
      adId: outcome.adId,
      adName: outcome.adId,
    };
    const current = rows.get(id) ?? emptyMetaEntity(level, reference);
    current.bricOrders += outcome.bricOrders;
    current.confirmedOrders += outcome.confirmedOrders;
    current.postedOrders += outcome.postedOrders;
    current.deliveredOrders += outcome.deliveredOrders;
    current.paidOrders += outcome.paidOrders;
    current.returnedOrders += outcome.returnedOrders;
    rows.set(id, current);
  }

  return [...rows.values()]
    .map(finalizeMetaEntity)
    .sort((left, right) => right.spendEur - left.spendEur || right.bricOrders - left.bricOrders);
}

function buildMetaDailyByLevel(
  level: Analytics2EntityLevel,
  daily: MetaDailyRow[],
  entities: Analytics2MetaEntity[],
) {
  const topIds = new Set(entities.slice(0, 24).map((entity) => entity.id));
  const rows = new Map<
    string,
    {
      day: string;
      id: string;
      name: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const source of daily) {
    const id =
      level === 'campaign' ? source.campaignId : level === 'adset' ? source.adsetId : source.adId;
    if (!topIds.has(id)) continue;
    const name =
      level === 'campaign'
        ? source.campaignName
        : level === 'adset'
          ? source.adsetName
          : source.adName;
    const key = `${source.day}\u0000${id}`;
    const current = rows.get(key) ?? {
      day: source.day,
      id,
      name: name || id,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += source.spendEur;
    current.adCostDzd += source.adCostDzd;
    current.impressions += source.impressions;
    current.linkClicks += source.linkClicks;
    current.outboundClicks += source.outboundClicks;
    rows.set(key, current);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
      outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
      cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

async function loadMetaPerformance(
  db: Database,
  filters: Analytics2Filters,
  economics: EconomicsReport,
) {
  const confirmedStatuses = sql.join(
    [...CONFIRMED_LIFECYCLE_ORDER_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const [spendResult, outcomeResult] = await Promise.all([
    db.execute(sql`
      select ${metaAdsDailyInsights.day}::text as day,
        ${metaAdsDailyInsights.campaignId} as campaign_id,
        max(${metaAdsDailyInsights.campaignName}) as campaign_name,
        ${metaAdsDailyInsights.adsetId} as adset_id,
        max(${metaAdsDailyInsights.adsetName}) as adset_name,
        ${metaAdsDailyInsights.adId} as ad_id,
        max(${metaAdsDailyInsights.adName}) as ad_name,
        coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision as spend_eur,
        coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::double precision as impressions,
        coalesce(sum(${metaAdsDailyInsights.clicks}), 0)::double precision as clicks,
        coalesce(sum(${metaAdsDailyInsights.inlineLinkClicks}), 0)::double precision as link_clicks,
        coalesce(sum(${metaAdsDailyInsights.outboundClicks}), 0)::double precision
          as outbound_clicks,
        coalesce(sum(${metaAdsDailyInsights.uniqueOutboundClicks}), 0)::double precision
          as unique_outbound_clicks,
        coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision
          as landing_page_views,
        coalesce(sum(${metaAdsDailyInsights.addToCarts}), 0)::double precision as add_to_carts,
        coalesce(sum(${metaAdsDailyInsights.initiateCheckouts}), 0)::double precision as checkouts,
        coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision as meta_purchases,
        coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision
          as purchase_value,
        coalesce(sum(${metaAdsDailyInsights.videoPlays}), 0)::double precision as video_plays,
        coalesce(sum(${metaAdsDailyInsights.videoP25Watched}), 0)::double precision
          as video_p25_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP50Watched}), 0)::double precision
          as video_p50_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP75Watched}), 0)::double precision
          as video_p75_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP95Watched}), 0)::double precision
          as video_p95_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP100Watched}), 0)::double precision
          as video_p100_watched,
        case when sum(${metaAdsDailyInsights.videoPlays}) > 0 then
          sum(
            ${metaAdsDailyInsights.videoAverageWatchSeconds}
            * ${metaAdsDailyInsights.videoPlays}
          ) / sum(${metaAdsDailyInsights.videoPlays})
        else 0 end::double precision as video_average_watch_seconds,
        max(${metaAdsDailyInsights.qualityRanking}) as quality_ranking,
        max(${metaAdsDailyInsights.engagementRateRanking}) as engagement_rate_ranking,
        max(${metaAdsDailyInsights.conversionRateRanking}) as conversion_rate_ranking
      from ${metaAdsDailyInsights}
      where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)}
      group by ${metaAdsDailyInsights.day}, ${metaAdsDailyInsights.campaignId},
        ${metaAdsDailyInsights.adsetId}, ${metaAdsDailyInsights.adId}
      order by ${metaAdsDailyInsights.day}, sum(${metaAdsDailyInsights.spend}) desc
    `),
    db.execute(sql`
      with first_posted as (
        select distinct on (${orderStatusHistory.orderId})
          ${orderStatusHistory.orderId} as order_id
        from ${orderStatusHistory}
        where ${orderStatusHistory.status} = 11
        order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
      ), delivered as (
        select distinct ${ecotrackOrderTrackingEvents.orderId} as order_id
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'livred'
      )
      select max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
        max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
        ${orderAcquisitionAttribution.metaAdId} as ad_id,
        count(*)::int as bric_orders,
        count(*) filter (where ${orders.confirmed} in (${confirmedStatuses}))::int
          as confirmed_orders,
        count(first_posted.order_id)::int as posted_orders,
        count(delivered.order_id)::int as delivered_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive')::int
          as paid_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
          as returned_orders
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      left join first_posted on first_posted.order_id = ${orders.id}
      left join delivered on delivered.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
        and ${timestampPredicate(
          orderAcquisitionAttribution.capturedAt,
          filters.startDate,
          filters.endDate,
        )}
      group by ${orderAcquisitionAttribution.metaAdId}
    `),
  ]);
  const fxByDay = new Map(
    economics.days.map((day) => [day.date, day.fxRateUsed || economics.settings.fxRate]),
  );
  const daily = spendResult.rows.map((raw: unknown): MetaDailyRow => {
    const row = raw as Record<string, unknown>;
    const day = String(row.day);
    const spendEur = numeric(row.spend_eur);
    return {
      day,
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name || row.campaign_id),
      adsetId: String(row.adset_id),
      adsetName: String(row.adset_name || row.adset_id),
      adId: String(row.ad_id),
      adName: String(row.ad_name || row.ad_id),
      spendEur,
      adCostDzd: spendEur * (fxByDay.get(day) ?? economics.settings.fxRate),
      impressions: numeric(row.impressions),
      clicks: numeric(row.clicks),
      linkClicks: numeric(row.link_clicks),
      outboundClicks: numeric(row.outbound_clicks),
      uniqueOutboundClicks: numeric(row.unique_outbound_clicks),
      landingPageViews: numeric(row.landing_page_views),
      addToCarts: numeric(row.add_to_carts),
      checkouts: numeric(row.checkouts),
      metaPurchases: numeric(row.meta_purchases),
      purchaseValue: numeric(row.purchase_value),
      videoPlays: numeric(row.video_plays),
      videoP25Watched: numeric(row.video_p25_watched),
      videoP50Watched: numeric(row.video_p50_watched),
      videoP75Watched: numeric(row.video_p75_watched),
      videoP95Watched: numeric(row.video_p95_watched),
      videoP100Watched: numeric(row.video_p100_watched),
      videoAverageWatchSeconds: numeric(row.video_average_watch_seconds),
      qualityRanking: row.quality_ranking ? String(row.quality_ranking) : null,
      engagementRateRanking: row.engagement_rate_ranking
        ? String(row.engagement_rate_ranking)
        : null,
      conversionRateRanking: row.conversion_rate_ranking
        ? String(row.conversion_rate_ranking)
        : null,
    };
  });
  const outcomes = outcomeResult.rows.map((raw: unknown): MetaOutcomeRow => {
    const row = raw as Record<string, unknown>;
    return {
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      adsetId: row.adset_id ? String(row.adset_id) : null,
      adId: String(row.ad_id),
      bricOrders: numeric(row.bric_orders),
      confirmedOrders: numeric(row.confirmed_orders),
      postedOrders: numeric(row.posted_orders),
      deliveredOrders: numeric(row.delivered_orders),
      paidOrders: numeric(row.paid_orders),
      returnedOrders: numeric(row.returned_orders),
    };
  });
  const campaigns = groupMetaEntities('campaign', daily, outcomes);
  const adsets = groupMetaEntities('adset', daily, outcomes);
  const ads = groupMetaEntities('ad', daily, outcomes);
  const total = ads.reduce(
    (summary, row) => {
      summary.spendEur += row.spendEur;
      summary.adCostDzd += row.adCostDzd;
      summary.impressions += row.impressions;
      summary.clicks += row.clicks;
      summary.linkClicks += row.linkClicks;
      summary.outboundClicks += row.outboundClicks;
      summary.uniqueOutboundClicks += row.uniqueOutboundClicks;
      summary.landingPageViews += row.landingPageViews;
      summary.addToCarts += row.addToCarts;
      summary.checkouts += row.checkouts;
      summary.metaPurchases += row.metaPurchases;
      summary.purchaseValue += row.purchaseValue;
      summary.videoPlays += row.videoPlays;
      summary.videoP25Watched += row.videoP25Watched;
      summary.videoP50Watched += row.videoP50Watched;
      summary.videoP75Watched += row.videoP75Watched;
      summary.videoP95Watched += row.videoP95Watched;
      summary.videoP100Watched += row.videoP100Watched;
      summary.videoWatchSecondsWeighted += (row.videoAverageWatchSeconds ?? 0) * row.videoPlays;
      summary.bricOrders += row.bricOrders;
      summary.confirmedOrders += row.confirmedOrders;
      summary.postedOrders += row.postedOrders;
      summary.deliveredOrders += row.deliveredOrders;
      summary.paidOrders += row.paidOrders;
      summary.returnedOrders += row.returnedOrders;
      return summary;
    },
    {
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      outboundClicks: 0,
      uniqueOutboundClicks: 0,
      landingPageViews: 0,
      addToCarts: 0,
      checkouts: 0,
      metaPurchases: 0,
      purchaseValue: 0,
      videoPlays: 0,
      videoP25Watched: 0,
      videoP50Watched: 0,
      videoP75Watched: 0,
      videoP95Watched: 0,
      videoP100Watched: 0,
      videoWatchSecondsWeighted: 0,
      bricOrders: 0,
      confirmedOrders: 0,
      postedOrders: 0,
      deliveredOrders: 0,
      paidOrders: 0,
      returnedOrders: 0,
    },
  );

  const { videoWatchSecondsWeighted, ...publicTotal } = total;
  return {
    summary: {
      ...publicTotal,
      ctrPct: total.impressions > 0 ? (total.linkClicks / total.impressions) * 100 : null,
      outboundCtrPct:
        total.impressions > 0 ? (total.outboundClicks / total.impressions) * 100 : null,
      landingViewRatePct:
        total.outboundClicks > 0 ? (total.landingPageViews / total.outboundClicks) * 100 : null,
      cpmEur: total.impressions > 0 ? (total.spendEur / total.impressions) * 1_000 : null,
      videoPlayRatePct: total.impressions > 0 ? (total.videoPlays / total.impressions) * 100 : null,
      videoCompletionRatePct:
        total.videoPlays > 0 ? (total.videoP100Watched / total.videoPlays) * 100 : null,
      videoAverageWatchSeconds:
        total.videoPlays > 0 ? videoWatchSecondsWeighted / total.videoPlays : null,
      costPerPostedDzd: total.postedOrders > 0 ? total.adCostDzd / total.postedOrders : null,
      costPerConfirmedDzd:
        total.confirmedOrders > 0 ? total.adCostDzd / total.confirmedOrders : null,
      costPerDeliveredDzd:
        total.deliveredOrders > 0 ? total.adCostDzd / total.deliveredOrders : null,
      costPerPaidDzd: total.paidOrders > 0 ? total.adCostDzd / total.paidOrders : null,
      platformRoas: total.spendEur > 0 ? total.purchaseValue / total.spendEur : null,
    },
    entities: { campaigns, adsets, ads },
    daily: {
      campaigns: buildMetaDailyByLevel('campaign', daily, campaigns),
      adsets: buildMetaDailyByLevel('adset', daily, adsets),
      ads: buildMetaDailyByLevel('ad', daily, ads),
    },
  };
}

async function loadMetaBreakdowns(
  db: Database,
  filters: Analytics2Filters,
  economics: EconomicsReport,
) {
  const [breakdownResult, budgetsResult, maturationResult] = await Promise.all([
    db.execute(sql`
      select ${metaAdsBreakdownDailyInsights.day}::text as day,
        ${metaAdsBreakdownDailyInsights.breakdownKind} as kind,
        ${metaAdsBreakdownDailyInsights.publisherPlatform} as publisher_platform,
        ${metaAdsBreakdownDailyInsights.platformPosition} as platform_position,
        ${metaAdsBreakdownDailyInsights.impressionDevice} as impression_device,
        ${metaAdsBreakdownDailyInsights.region} as region,
        coalesce(sum(${metaAdsBreakdownDailyInsights.spend}), 0)::double precision as spend_eur,
        coalesce(sum(${metaAdsBreakdownDailyInsights.impressions}), 0)::double precision
          as impressions,
        coalesce(sum(${metaAdsBreakdownDailyInsights.outboundClicks}), 0)::double precision
          as outbound_clicks,
        coalesce(sum(${metaAdsBreakdownDailyInsights.landingPageViews}), 0)::double precision
          as landing_page_views,
        coalesce(sum(${metaAdsBreakdownDailyInsights.purchases}), 0)::double precision
          as purchases,
        coalesce(sum(${metaAdsBreakdownDailyInsights.purchaseValue}), 0)::double precision
          as purchase_value
      from ${metaAdsBreakdownDailyInsights}
      where ${datePredicate(metaAdsBreakdownDailyInsights.day, filters.startDate, filters.endDate)}
      group by ${metaAdsBreakdownDailyInsights.day},
        ${metaAdsBreakdownDailyInsights.breakdownKind},
        ${metaAdsBreakdownDailyInsights.publisherPlatform},
        ${metaAdsBreakdownDailyInsights.platformPosition},
        ${metaAdsBreakdownDailyInsights.impressionDevice},
        ${metaAdsBreakdownDailyInsights.region}
      order by sum(${metaAdsBreakdownDailyInsights.spend}) desc
    `),
    db.execute(sql`
      with campaign_spend as (
        select ${metaAdsDailyInsights.campaignId} as campaign_id,
          sum(${metaAdsDailyInsights.spend})::double precision as today_spend_eur
        from ${metaAdsDailyInsights}
        where ${metaAdsDailyInsights.day} = ${filters.endDate}::date
        group by ${metaAdsDailyInsights.campaignId}
      ), delivery as (
      select ${metaAdsDeliveryEntities.campaignId} as campaign_id,
        max(${metaAdsDeliveryEntities.campaignName}) as campaign_name,
        coalesce(
          max(${metaAdsDeliveryEntities.dailyBudget}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'campaign'
          ),
          sum(${metaAdsDeliveryEntities.dailyBudget}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'adset'
          )
        )::double precision as daily_budget_eur,
        coalesce(
          max(${metaAdsDeliveryEntities.budgetRemaining}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'campaign'
          ),
          sum(${metaAdsDeliveryEntities.budgetRemaining}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'adset'
          )
        )::double precision as budget_remaining_eur,
        max(${metaAdsDeliveryEntities.effectiveStatus}) as effective_status,
        max(${metaAdsDeliveryEntities.syncedAt}) as synced_at
      from ${metaAdsDeliveryEntities}
      where ${metaAdsDeliveryEntities.campaignId} is not null
      group by ${metaAdsDeliveryEntities.campaignId}
      )
      select delivery.*, coalesce(campaign_spend.today_spend_eur, 0)::double precision
        as today_spend_eur
      from delivery
      left join campaign_spend using (campaign_id)
    `),
    db.execute(sql`
      with paid as (
        select ${ecotrackOrderTrackingEvents.orderId} as order_id,
          min(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as paid_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'payed'
        group by ${ecotrackOrderTrackingEvents.orderId}
      ), attributed as (
        select ${orderAcquisitionAttribution.metaCampaignId} as campaign_id,
          ${orders.id} as order_id,
          ${orders.createdAt} as ordered_at,
          paid.paid_at,
          ${ecotrackOrderStates.currentStatus} as outcome
        from ${orderAcquisitionAttribution}
        inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
        left join paid on paid.order_id = ${orders.id}
        left join ${ecotrackOrderStates}
          on ${ecotrackOrderStates.orderId} = ${orders.id}
          and ${ecotrackOrderStates.deletedAt} is null
        where ${orderAcquisitionAttribution.channel} = 'meta_paid'
          and ${orderAcquisitionAttribution.metaCampaignId} is not null
          and ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
      )
      select campaign_id,
        count(*)::int as orders,
        count(*) filter (where paid_at <= ordered_at + interval '1 day')::int as paid_d0,
        count(*) filter (where paid_at <= ordered_at + interval '4 days')::int as paid_d3,
        count(*) filter (where paid_at <= ordered_at + interval '8 days')::int as paid_d7,
        count(*) filter (where paid_at <= ordered_at + interval '15 days')::int as paid_d14,
        count(*) filter (where paid_at is not null)::int as paid_mature,
        count(*) filter (where outcome in ('paye_et_archive', 'retour_archive'))::int
          as terminal
      from attributed
      group by campaign_id
      order by count(*) desc
    `),
  ]);
  const fxByDay = new Map(
    economics.days.map((day) => [day.date, day.fxRateUsed || economics.settings.fxRate]),
  );
  type BreakdownAccumulator = {
    key: string;
    publisherPlatform: string | null;
    platformPosition: string | null;
    impressionDevice: string | null;
    region: string | null;
    spendEur: number;
    adCostDzd: number;
    impressions: number;
    outboundClicks: number;
    landingPageViews: number;
    purchases: number;
    purchaseValue: number;
  };
  const placementRows = new Map<string, BreakdownAccumulator>();
  const regionRows = new Map<string, BreakdownAccumulator>();
  for (const raw of breakdownResult.rows as Iterable<unknown>) {
    const row = raw as Record<string, unknown>;
    const kind = String(row.kind);
    const publisherPlatform = String(row.publisher_platform || '') || null;
    const platformPosition = String(row.platform_position || '') || null;
    const impressionDevice = String(row.impression_device || '') || null;
    const region = String(row.region || '') || null;
    const key =
      kind === 'region'
        ? region || 'Unknown'
        : [publisherPlatform, platformPosition, impressionDevice].filter(Boolean).join(' · ') ||
          'Unknown';
    const target = kind === 'region' ? regionRows : placementRows;
    const current = target.get(key) ?? {
      key,
      publisherPlatform,
      platformPosition,
      impressionDevice,
      region,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      outboundClicks: 0,
      landingPageViews: 0,
      purchases: 0,
      purchaseValue: 0,
    };
    const spendEur = numeric(row.spend_eur);
    current.spendEur += spendEur;
    current.adCostDzd += spendEur * (fxByDay.get(String(row.day)) ?? economics.settings.fxRate);
    current.impressions += numeric(row.impressions);
    current.outboundClicks += numeric(row.outbound_clicks);
    current.landingPageViews += numeric(row.landing_page_views);
    current.purchases += numeric(row.purchases);
    current.purchaseValue += numeric(row.purchase_value);
    target.set(key, current);
  }
  const finalizeBreakdown = (row: BreakdownAccumulator) => ({
    ...row,
    outboundCtrPct: ratio(row.outboundClicks, row.impressions),
    landingViewRatePct: ratio(row.landingPageViews, row.outboundClicks),
    cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
  });
  const budgetRows = Array.from(budgetsResult.rows as Iterable<unknown>, (raw) => {
    const row = raw as Record<string, unknown>;
    const dailyBudgetEur = nullableNumeric(row.daily_budget_eur);
    const todaySpendEur = numeric(row.today_spend_eur);
    return {
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name || row.campaign_id),
      effectiveStatus: row.effective_status ? String(row.effective_status) : null,
      dailyBudgetEur,
      budgetRemainingEur: nullableNumeric(row.budget_remaining_eur),
      todaySpendEur,
      pacePct: dailyBudgetEur && dailyBudgetEur > 0 ? (todaySpendEur / dailyBudgetEur) * 100 : null,
      syncedAt: isoValue(row.synced_at),
    };
  });
  return {
    placements: [...placementRows.values()]
      .map(finalizeBreakdown)
      .sort((left, right) => right.spendEur - left.spendEur),
    regions: [...regionRows.values()]
      .map(finalizeBreakdown)
      .sort((left, right) => right.spendEur - left.spendEur),
    budgets: budgetRows,
    maturation: Array.from(maturationResult.rows as Iterable<unknown>, (raw) => {
      const row = raw as Record<string, unknown>;
      const ordersCount = numeric(row.orders);
      return {
        campaignId: String(row.campaign_id),
        orders: ordersCount,
        terminal: numeric(row.terminal),
        points: [
          { day: 0, paidRatePct: ratio(numeric(row.paid_d0), ordersCount) },
          { day: 3, paidRatePct: ratio(numeric(row.paid_d3), ordersCount) },
          { day: 7, paidRatePct: ratio(numeric(row.paid_d7), ordersCount) },
          { day: 14, paidRatePct: ratio(numeric(row.paid_d14), ordersCount) },
          { day: 21, paidRatePct: ratio(numeric(row.paid_mature), ordersCount) },
        ],
        maturityPct: ratio(numeric(row.terminal), ordersCount),
      };
    }),
  };
}

function freshnessState(throughDate: string | null, endDate: string): Analytics2Source['state'] {
  if (!throughDate) return 'missing';
  const lag = Math.max(0, inclusiveDays(throughDate.slice(0, 10), endDate) - 1);
  if (lag <= 1) return 'current';
  if (lag <= 3) return 'lagged';
  return 'partial';
}

async function loadSourceHealth(
  db: Database,
  filters: Analytics2Filters,
  economics?: EconomicsReport,
): Promise<Analytics2Source[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), posted as (
      select first_posted.order_id,
        first_posted.posted_day,
        ${ecotrackOrderStates.orderId} as tracked_order_id
      from first_posted
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    ), settled as (
      select * from ${processedOrders}
      where ${datePredicate(
        sql`(coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt}) at time zone 'Africa/Algiers')::date`,
        filters.startDate,
        filters.endDate,
      )}
    )
    select
      (select count(*)::int from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as order_records,
      (select max(${orders.updatedAt}) from ${orders}) as orders_updated_at,
      (select count(*)::int from posted) as posted_records,
      (select count(tracked_order_id)::int from posted) as ecotrack_records,
      (select max(${ecotrackOrderStates.updatedAt}) from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null) as ecotrack_updated_at,
      (select count(distinct ${metaAdsDailyInsights.day})::int from ${metaAdsDailyInsights}
        where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)})
        as meta_days,
      (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}
        where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)})
        as meta_through_date,
      (select max(${metaAdsDailyInsights.syncedAt}) from ${metaAdsDailyInsights})
        as meta_updated_at,
      ((select count(*)::int from ${analyticsDailyRollups}
          where ${datePredicate(analyticsDailyRollups.day, filters.startDate, filters.endDate)})
        + (select count(*)::int from ${analyticsEvents}
          where ${timestampPredicate(analyticsEvents.occurredAt, filters.startDate, filters.endDate)}
            and not exists (
              select 1 from ${analyticsDailyRollups} rollup
              where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
                and rollup.dimension = 'overall'
                and rollup.dimension_key = ''
            ))) as storefront_records,
      greatest(
        (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}
          where ${datePredicate(analyticsDailyRollups.day, filters.startDate, filters.endDate)}),
        (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
          from ${analyticsEvents}
          where ${timestampPredicate(analyticsEvents.occurredAt, filters.startDate, filters.endDate)})
      ) as storefront_through_date,
      greatest(
        (select max(${analyticsDailyRollups.updatedAt}) from ${analyticsDailyRollups}),
        (select max(${analyticsEvents.createdAt}) from ${analyticsEvents})
      ) as storefront_updated_at,
      (select count(*)::int from settled) as settlement_records,
      (select max(imported_at) from settled) as settlements_updated_at,
      (select max((coalesce(encaissed_at, delivered_at, order_created_at)
        at time zone 'Africa/Algiers')::date) from settled) as settlements_through_date
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const postedRecords = numeric(row.posted_records);
  const metaDays = numeric(row.meta_days);
  const expectedDays = filters.startDate ? inclusiveDays(filters.startDate, filters.endDate) : null;
  const metaThrough = row.meta_through_date ? String(row.meta_through_date) : null;
  const storefrontThrough = row.storefront_through_date
    ? String(row.storefront_through_date)
    : null;
  const settlementsThrough = row.settlements_through_date
    ? String(row.settlements_through_date)
    : null;
  return [
    {
      key: 'orders',
      state: 'live',
      updatedAt: isoValue(row.orders_updated_at),
      throughDate: filters.endDate,
      records: numeric(row.order_records),
      coveragePct: 100,
    },
    {
      key: 'ecotrack',
      state: row.ecotrack_updated_at ? 'live' : 'missing',
      updatedAt: isoValue(row.ecotrack_updated_at),
      throughDate: filters.endDate,
      records: numeric(row.ecotrack_records),
      coveragePct: postedRecords > 0 ? (numeric(row.ecotrack_records) / postedRecords) * 100 : null,
    },
    {
      key: 'meta',
      state: freshnessState(metaThrough, filters.endDate),
      updatedAt: isoValue(row.meta_updated_at),
      throughDate: metaThrough,
      records: metaDays,
      coveragePct: expectedDays && expectedDays > 0 ? (metaDays / expectedDays) * 100 : null,
    },
    {
      key: 'storefront',
      state: freshnessState(storefrontThrough, filters.endDate),
      updatedAt: isoValue(row.storefront_updated_at),
      throughDate: storefrontThrough,
      records: numeric(row.storefront_records),
      coveragePct: null,
    },
    {
      key: 'settlements',
      state: economics?.freshness.settledReportThroughDate ? 'lagged' : 'missing',
      updatedAt: isoValue(row.settlements_updated_at),
      throughDate: settlementsThrough,
      records: numeric(row.settlement_records),
      coveragePct: economics?.coverage.settlementCoveragePct ?? null,
    },
    {
      key: 'assumptions',
      state: 'manual',
      updatedAt: null,
      throughDate: null,
      records:
        economics?.days.filter(
          (day) =>
            day.grossProfitSource === 'manual' ||
            day.returnRateSource === 'manual' ||
            day.confirmedOrdersSource === 'manual',
        ).length ?? 0,
      coveragePct: economics?.coverage.projectedCoveragePct ?? null,
    },
  ];
}

async function loadStorefrontPaths(db: Database, filters: Analytics2Filters, now = new Date()) {
  const retainedFrom = addDays(dayInTimezone(now), -6);
  const coverageStartDate =
    filters.startDate && filters.startDate > retainedFrom ? filters.startDate : retainedFrom;
  const coverageEndDate = filters.endDate;
  if (coverageStartDate > coverageEndDate) {
    return { coverageStartDate, coverageEndDate, coverageIsPartial: true, rows: [] };
  }
  const result = await db.execute(sql`
    with sequence as (
      select ${analyticsEvents.sessionId} as session_id,
        coalesce(nullif(${analyticsEvents.pagePath}, ''), '(unknown)') as from_path,
        lead(coalesce(nullif(${analyticsEvents.pagePath}, ''), '(unknown)')) over (
          partition by ${analyticsEvents.sessionId}
          order by ${analyticsEvents.occurredAt}, ${analyticsEvents.id}
        ) as to_path
      from ${analyticsEvents}
      where ${analyticsEvents.eventName} = 'page_view'
        and ${timestampPredicate(analyticsEvents.occurredAt, coverageStartDate, coverageEndDate)}
    )
    select from_path, to_path,
      count(*)::int as transitions,
      count(distinct session_id)::int as sessions
    from sequence
    where to_path is not null and from_path <> to_path
    group by from_path, to_path
    order by count(distinct session_id) desc, count(*) desc
    limit 24
  `);
  return {
    coverageStartDate,
    coverageEndDate,
    coverageIsPartial: !filters.startDate || coverageStartDate > filters.startDate,
    rows: result.rows.map((raw: unknown) => {
      const row = raw as Record<string, unknown>;
      return {
        from: String(row.from_path),
        to: String(row.to_path),
        transitions: numeric(row.transitions),
        sessions: numeric(row.sessions),
      };
    }),
  };
}

async function loadBasketPairs(db: Database, filters: Analytics2Filters) {
  const result = await db.execute(sql`
    select least(left_item.title_snapshot, right_item.title_snapshot) as left_title,
      greatest(left_item.title_snapshot, right_item.title_snapshot) as right_title,
      count(distinct left_item.order_id)::int as orders
    from ${orderLineItems} left_item
    inner join ${orderLineItems} right_item
      on right_item.order_id = left_item.order_id
      and right_item.id > left_item.id
      and right_item.content_id <> left_item.content_id
    inner join ${orders} on ${orders.id} = left_item.order_id
    where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
    group by least(left_item.title_snapshot, right_item.title_snapshot),
      greatest(left_item.title_snapshot, right_item.title_snapshot)
    order by count(distinct left_item.order_id) desc, left_title, right_title
    limit 20
  `);
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    return {
      left: String(row.left_title),
      right: String(row.right_title),
      orders: numeric(row.orders),
    };
  });
}

type OperationalProductRow = {
  id: string;
  title: string;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  postedOrders: number;
  postedUnits: number;
  paidOrders: number;
  paidUnits: number;
  returnedOrders: number;
  activeOrders: number;
  terminalPaidRatePct: number | null;
  costCoveragePct: number | null;
  projectedContributionDzd: number | null;
  deliveryMedianHours: number | null;
  paymentMedianHours: number | null;
  deliverySamples: number;
};

async function loadOperationalProducts(
  db: Database,
  filters: Analytics2Filters,
  planningReturnRatePct: number,
): Promise<OperationalProductRow[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'payed') as paid_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    )
    select coalesce(${orderLineItems.productId}::text, ${orderLineItems.contentId}) as product_key,
      max(${orderLineItems.titleSnapshot}) as title,
      max(${productCatalog.sku}) as sku,
      max(${categories.name}) as category_name,
      max(${brands.name}) as brand_name,
      count(distinct ${orderLineItems.orderId})::int as posted_orders,
      coalesce(sum(${orderLineItems.quantity}), 0)::int as posted_units,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive'
      )::int as paid_orders,
      coalesce(sum(${orderLineItems.quantity}) filter (
        where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive'
      ), 0)::int as paid_units,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${ecotrackOrderStates.currentStatus} = 'retour_archive'
      )::int as returned_orders,
      count(distinct ${orderLineItems.orderId}) filter (
        where coalesce(${ecotrackOrderStates.currentStatus}, '') not in (
          'paye_et_archive', 'retour_archive', 'annule'
        )
      )::int as active_orders,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${orderLineItems.unitPurchasePriceSnapshot} is not null
      )::int as cost_complete_orders,
      sum(
        (${orderLineItems.lineTotal} - (
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
        )) * (1 - coalesce(
          ${profitTrackerDays.returnRatePct}::double precision,
          ${planningReturnRatePct}::double precision
        ) / 100)
      ) filter (
        where ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
      )::double precision as projected_contribution,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_day::timestamp)) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.paid_at - first_posted.posted_day::timestamp)) / 3600
      ) filter (where lifecycle.paid_at is not null)::double precision
        as payment_median_hours,
      count(distinct ${orderLineItems.orderId}) filter (
        where lifecycle.delivered_at is not null
      )::int as delivery_samples
    from first_posted
    inner join ${orderLineItems} on ${orderLineItems.orderId} = first_posted.order_id
    left join ${productCatalog} on ${productCatalog.id} = ${orderLineItems.productId}
    left join ${categories} on ${categories.id} = ${productCatalog.categoryId}
    left join ${brands} on ${brands.id} = ${productCatalog.brandId}
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    left join lifecycle on lifecycle.order_id = first_posted.order_id
    left join ${profitTrackerDays}
      on ${profitTrackerDays.day} = first_posted.posted_day
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    group by coalesce(${orderLineItems.productId}::text, ${orderLineItems.contentId})
    order by sum(${orderLineItems.quantity}) desc, max(${orderLineItems.titleSnapshot})
    limit 500
  `);
  return Array.from(result.rows as Iterable<unknown>, (raw): OperationalProductRow => {
    const row = raw as Record<string, unknown>;
    const paidOrders = numeric(row.paid_orders);
    const returnedOrders = numeric(row.returned_orders);
    const postedOrders = numeric(row.posted_orders);
    return {
      id: String(row.product_key),
      title: String(row.title || 'Untitled product'),
      sku: row.sku ? String(row.sku) : null,
      categoryName: row.category_name ? String(row.category_name) : null,
      brandName: row.brand_name ? String(row.brand_name) : null,
      postedOrders,
      postedUnits: numeric(row.posted_units),
      paidOrders,
      paidUnits: numeric(row.paid_units),
      returnedOrders,
      activeOrders: numeric(row.active_orders),
      terminalPaidRatePct: ratio(paidOrders, paidOrders + returnedOrders),
      costCoveragePct: ratio(numeric(row.cost_complete_orders), postedOrders),
      projectedContributionDzd: nullableNumeric(row.projected_contribution),
      deliveryMedianHours: nullableNumeric(row.delivery_median_hours),
      paymentMedianHours: nullableNumeric(row.payment_median_hours),
      deliverySamples: numeric(row.delivery_samples),
    };
  });
}

type ProductMetaAssociation = {
  productId: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  attributedOrders: number;
  paidOrders: number;
};

async function loadProductMetaAssociations(
  db: Database,
  filters: Analytics2Filters,
): Promise<ProductMetaAssociation[]> {
  const result = await db.execute(sql`
    select coalesce(${orderLineItems.productId}::text, ${orderLineItems.contentId}) as product_id,
      max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
      max(insight.campaign_name) as campaign_name,
      max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
      max(insight.adset_name) as adset_name,
      ${orderAcquisitionAttribution.metaAdId} as ad_id,
      max(insight.ad_name) as ad_name,
      count(distinct ${orders.id})::int as attributed_orders,
      count(distinct ${orders.id}) filter (
        where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive'
      )::int as paid_orders
    from ${orderAcquisitionAttribution}
    inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
    inner join ${orderLineItems} on ${orderLineItems.orderId} = ${orders.id}
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = ${orders.id}
      and ${ecotrackOrderStates.deletedAt} is null
    left join lateral (
      select ${metaAdsDailyInsights.campaignName} as campaign_name,
        ${metaAdsDailyInsights.adsetName} as adset_name,
        ${metaAdsDailyInsights.adName} as ad_name
      from ${metaAdsDailyInsights}
      where ${metaAdsDailyInsights.adId} = ${orderAcquisitionAttribution.metaAdId}
      order by ${metaAdsDailyInsights.day} desc
      limit 1
    ) insight on true
    where ${orderAcquisitionAttribution.channel} = 'meta_paid'
      and ${orderAcquisitionAttribution.metaAdId} is not null
      and ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
    group by coalesce(${orderLineItems.productId}::text, ${orderLineItems.contentId}),
      ${orderAcquisitionAttribution.metaAdId}
    order by count(distinct ${orders.id}) desc
  `);
  return Array.from(result.rows as Iterable<unknown>, (raw): ProductMetaAssociation => {
    const row = raw as Record<string, unknown>;
    return {
      productId: String(row.product_id),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      campaignName: row.campaign_name ? String(row.campaign_name) : null,
      adsetId: row.adset_id ? String(row.adset_id) : null,
      adsetName: row.adset_name ? String(row.adset_name) : null,
      adId: String(row.ad_id),
      adName: row.ad_name ? String(row.ad_name) : null,
      attributedOrders: numeric(row.attributed_orders),
      paidOrders: numeric(row.paid_orders),
    };
  });
}

type OperationalGeographyRow = {
  wilayaId: number | null;
  name: string;
  postedOrders: number;
  paidOrders: number;
  returnedOrders: number;
  activeOrders: number;
  pipelineCodDzd: number;
  providerAmountCoveragePct: number | null;
  terminalPaidRatePct: number | null;
  deliveryMedianHours: number | null;
  deliverySamples: number;
  averageAttempts: number | null;
};

async function loadOperationalGeography(
  db: Database,
  filters: Analytics2Filters,
): Promise<OperationalGeographyRow[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
        count(*) filter (
          where ${ecotrackOrderTrackingEvents.status} = 'attempt_delivery'
        )::int as attempt_count
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    )
    select ${orders.state} as wilaya_id,
      coalesce(${ecotrackWilayas.name}, 'Unknown') as wilaya_name,
      count(*)::int as posted_orders,
      count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive')::int
        as paid_orders,
      count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
        as returned_orders,
      count(*) filter (
        where coalesce(${ecotrackOrderStates.currentStatus}, '') not in (
          'paye_et_archive', 'retour_archive', 'annule'
        )
      )::int as active_orders,
      coalesce(sum(coalesce(
        ${ecotrackOrderStates.currentAmount}::double precision,
        ${orders.totalAmount}::double precision
      )) filter (
        where coalesce(${ecotrackOrderStates.currentStatus}, '') not in (
          'paye_et_archive', 'retour_archive', 'annule'
        )
      ), 0)::double precision as pipeline_cod,
      count(*) filter (
        where ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
      )::int as provider_amount_orders,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_day::timestamp)) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      count(*) filter (where lifecycle.delivered_at is not null)::int as delivery_samples,
      avg(lifecycle.attempt_count) filter (
        where lifecycle.attempt_count is not null
      ) as average_attempts
    from first_posted
    inner join ${orders} on ${orders.id} = first_posted.order_id
    left join ${ecotrackWilayas} on ${ecotrackWilayas.wilayaId} = ${orders.state}
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    left join lifecycle on lifecycle.order_id = first_posted.order_id
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    group by ${orders.state}, coalesce(${ecotrackWilayas.name}, 'Unknown')
    order by count(*) desc, coalesce(${ecotrackWilayas.name}, 'Unknown')
  `);
  return Array.from(result.rows as Iterable<unknown>, (raw): OperationalGeographyRow => {
    const row = raw as Record<string, unknown>;
    const postedOrders = numeric(row.posted_orders);
    const paidOrders = numeric(row.paid_orders);
    const returnedOrders = numeric(row.returned_orders);
    return {
      wilayaId: row.wilaya_id == null ? null : numeric(row.wilaya_id),
      name: String(row.wilaya_name),
      postedOrders,
      paidOrders,
      returnedOrders,
      activeOrders: numeric(row.active_orders),
      pipelineCodDzd: numeric(row.pipeline_cod),
      providerAmountCoveragePct: ratio(numeric(row.provider_amount_orders), postedOrders),
      terminalPaidRatePct: ratio(paidOrders, paidOrders + returnedOrders),
      deliveryMedianHours: nullableNumeric(row.delivery_median_hours),
      deliverySamples: numeric(row.delivery_samples),
      averageAttempts: nullableNumeric(row.average_attempts),
    };
  });
}

async function loadOperationalCommunes(db: Database, filters: Analytics2Filters) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
        count(*) filter (
          where ${ecotrackOrderTrackingEvents.status} = 'attempt_delivery'
        )::int as attempt_count
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    )
    select ${orders.state} as wilaya_id,
      coalesce(${ecotrackWilayas.name}, 'Unknown') as wilaya_name,
      coalesce(nullif(trim(${orders.city}), ''), 'Unknown') as commune_name,
      count(*)::int as posted_orders,
      count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'paye_et_archive')::int
        as paid_orders,
      count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
        as returned_orders,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_day::timestamp)) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      avg(lifecycle.attempt_count) filter (
        where lifecycle.attempt_count is not null
      ) as average_attempts
    from first_posted
    inner join ${orders} on ${orders.id} = first_posted.order_id
    left join ${ecotrackWilayas} on ${ecotrackWilayas.wilayaId} = ${orders.state}
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    left join lifecycle on lifecycle.order_id = first_posted.order_id
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    group by ${orders.state}, coalesce(${ecotrackWilayas.name}, 'Unknown'),
      coalesce(nullif(trim(${orders.city}), ''), 'Unknown')
    order by count(*) desc
    limit 250
  `);
  return Array.from(result.rows as Iterable<unknown>, (raw) => {
    const row = raw as Record<string, unknown>;
    const paidOrders = numeric(row.paid_orders);
    const returnedOrders = numeric(row.returned_orders);
    return {
      wilayaId: row.wilaya_id == null ? null : numeric(row.wilaya_id),
      wilayaName: String(row.wilaya_name),
      name: String(row.commune_name),
      postedOrders: numeric(row.posted_orders),
      paidOrders,
      returnedOrders,
      terminalPaidRatePct: ratio(paidOrders, paidOrders + returnedOrders),
      deliveryMedianHours: nullableNumeric(row.delivery_median_hours),
      averageAttempts: nullableNumeric(row.average_attempts),
    };
  });
}

async function loadMetaRegions(db: Database, filters: Analytics2Filters) {
  const result = await db.execute(sql`
    select ${metaAdsBreakdownDailyInsights.region} as region,
      sum(${metaAdsBreakdownDailyInsights.spend})::double precision as spend_eur,
      sum(${metaAdsBreakdownDailyInsights.impressions})::double precision as impressions,
      sum(${metaAdsBreakdownDailyInsights.outboundClicks})::double precision as outbound_clicks,
      sum(${metaAdsBreakdownDailyInsights.landingPageViews})::double precision
        as landing_page_views
    from ${metaAdsBreakdownDailyInsights}
    where ${metaAdsBreakdownDailyInsights.breakdownKind} = 'region'
      and ${metaAdsBreakdownDailyInsights.region} <> ''
      and ${datePredicate(metaAdsBreakdownDailyInsights.day, filters.startDate, filters.endDate)}
    group by ${metaAdsBreakdownDailyInsights.region}
    order by sum(${metaAdsBreakdownDailyInsights.spend}) desc
  `);
  return Array.from(result.rows as Iterable<unknown>, (raw) => {
    const row = raw as Record<string, unknown>;
    const impressions = numeric(row.impressions);
    const outboundClicks = numeric(row.outbound_clicks);
    return {
      name: String(row.region),
      spendEur: numeric(row.spend_eur),
      impressions,
      outboundClicks,
      landingPageViews: numeric(row.landing_page_views),
      outboundCtrPct: ratio(outboundClicks, impressions),
    };
  });
}

async function loadCustomerEconomics(
  db: Database,
  filters: Analytics2Filters,
  fallbackFxRate: number,
) {
  const result = await db.execute(sql`
    with line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(${orderLineItems.unitPurchasePriceSnapshot} is not null) as cost_complete,
        sum(
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
        )::double precision as product_cost
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), meta_spend as (
      select ${metaAdsDailyInsights.adId} as ad_id,
        ${metaAdsDailyInsights.day} as day,
        sum(${metaAdsDailyInsights.spend})::double precision as spend_eur
      from ${metaAdsDailyInsights}
      group by ${metaAdsDailyInsights.adId}, ${metaAdsDailyInsights.day}
    ), attributed_orders as (
      select ${orderAcquisitionAttribution.metaAdId} as ad_id,
        (${orders.createdAt} at time zone 'Africa/Algiers')::date as day,
        count(distinct ${orders.id})::int as orders
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
      group by ${orderAcquisitionAttribution.metaAdId},
        (${orders.createdAt} at time zone 'Africa/Algiers')::date
    ), ordered as (
      select ${orders.id} as order_id,
        coalesce(
          nullif(${orders.normalizedPhone}, ''),
          regexp_replace(${orders.phoneNumber1}, '\\D', '', 'g')
        ) as customer_key,
        trim(concat_ws(' ', ${orders.firstName}, ${orders.lastName})) as customer_name,
        coalesce(nullif(trim(${orders.city}), ''), 'Unknown') as city,
        ${orders.createdAt} as ordered_at,
        (${orders.createdAt} at time zone 'Africa/Algiers')::date as order_day,
        ${orders.totalAmount}::double precision as order_value,
        row_number() over (
          partition by coalesce(
            nullif(${orders.normalizedPhone}, ''),
            regexp_replace(${orders.phoneNumber1}, '\\D', '', 'g')
          )
          order by ${orders.createdAt}, ${orders.id}
        ) as order_number,
        lag(${orders.createdAt}) over (
          partition by coalesce(
            nullif(${orders.normalizedPhone}, ''),
            regexp_replace(${orders.phoneNumber1}, '\\D', '', 'g')
          )
          order by ${orders.createdAt}, ${orders.id}
        ) as previous_order_at,
        case when ${ecotrackOrderStates.currentStatus} = 'paye_et_archive'
          and line_economics.cost_complete
          and coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) is not null
          and coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) is not null
        then coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) - coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) - line_economics.product_cost
        end as paid_contribution,
        ${orderAcquisitionAttribution.metaAdId} as meta_ad_id
      from ${orders}
      left join line_economics on line_economics.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join ${orderAcquisitionAttribution}
        on ${orderAcquisitionAttribution.orderId} = ${orders.id}
        and ${orderAcquisitionAttribution.channel} = 'meta_paid'
      where (${orders.createdAt} at time zone 'Africa/Algiers')::date <= ${filters.endDate}::date
    ), cohort_customers as (
      select customer_key
      from ordered
      group by customer_key
      having ${filters.startDate ? sql`min(order_day) >= ${filters.startDate}::date and` : sql``}
        min(order_day) <= ${filters.endDate}::date
    ), with_acquisition as (
      select ordered.*,
        case when ordered.order_number = 1 and attributed_orders.orders > 0 then
          meta_spend.spend_eur
          * coalesce(${profitTrackerDays.fxRateUsed}::double precision, ${fallbackFxRate})
          / attributed_orders.orders
        end as acquisition_cost
      from ordered
      inner join cohort_customers using (customer_key)
      left join attributed_orders
        on attributed_orders.ad_id = ordered.meta_ad_id
        and attributed_orders.day = ordered.order_day
      left join meta_spend
        on meta_spend.ad_id = ordered.meta_ad_id
        and meta_spend.day = ordered.order_day
      left join ${profitTrackerDays} on ${profitTrackerDays.day} = ordered.order_day
    ), customer_rollup as (
      select customer_key,
        (array_agg(customer_name order by ordered_at desc))[1] as customer_name,
        (array_agg(city order by ordered_at desc))[1] as city,
        count(*)::int as orders,
        sum(order_value)::double precision as total_value,
        min(ordered_at) as first_order_at,
        max(ordered_at) as last_order_at,
        avg(extract(epoch from (ordered_at - previous_order_at)) / 86400)
          filter (where previous_order_at is not null)::double precision as reorder_days,
        coalesce(sum(paid_contribution), 0)::double precision as contribution_ltv,
        count(paid_contribution)::int as paid_orders,
        max(acquisition_cost)::double precision as acquisition_cost
      from with_acquisition
      group by customer_key
    )
    select *,
      case when acquisition_cost > 0 then contribution_ltv / acquisition_cost end
        as acquisition_payback_ratio
    from customer_rollup
    order by orders desc, total_value desc
    limit 500
  `);
  const rows = Array.from(result.rows as Iterable<unknown>, (raw) => {
    const row = raw as Record<string, unknown>;
    const ordersCount = numeric(row.orders);
    return {
      name: String(row.customer_name || 'Customer'),
      city: String(row.city || 'Unknown'),
      orders: ordersCount,
      totalValue: numeric(row.total_value),
      averageOrderValue: ordersCount > 0 ? numeric(row.total_value) / ordersCount : 0,
      firstOrderAt: isoValue(row.first_order_at),
      lastOrderAt: isoValue(row.last_order_at),
      reorderIntervalDays: nullableNumeric(row.reorder_days),
      contributionLtvDzd: numeric(row.contribution_ltv),
      paidOrders: numeric(row.paid_orders),
      acquisitionCostDzd: nullableNumeric(row.acquisition_cost),
      acquisitionPaybackRatio: nullableNumeric(row.acquisition_payback_ratio),
    };
  });
  const customers = rows.length;
  const repeatCustomers = rows.filter((row) => row.orders >= 2).length;
  const attributed = rows.filter((row) => row.acquisitionCostDzd != null);
  const sortedReorder = rows
    .flatMap((row) => (row.reorderIntervalDays == null ? [] : [row.reorderIntervalDays]))
    .sort((left, right) => left - right);
  return {
    summary: {
      customers,
      repeatCustomers,
      repeatRate: ratio(repeatCustomers, customers),
      secondOrderConversionPct: ratio(repeatCustomers, customers),
      averageOrders: customers > 0 ? rows.reduce((sum, row) => sum + row.orders, 0) / customers : 0,
      averageOrderValue:
        customers > 0
          ? rows.reduce((sum, row) => sum + row.totalValue, 0) /
            rows.reduce((sum, row) => sum + row.orders, 0)
          : 0,
      medianReorderIntervalDays:
        sortedReorder.length > 0 ? sortedReorder[Math.floor(sortedReorder.length / 2)] : null,
      averageContributionLtvDzd:
        customers > 0
          ? rows.reduce((sum, row) => sum + row.contributionLtvDzd, 0) / customers
          : null,
      acquisitionPaybackPct: ratio(
        attributed.filter((row) => (row.acquisitionPaybackRatio ?? 0) >= 1).length,
        attributed.length,
      ),
      acquisitionCoveragePct: ratio(attributed.length, customers),
    },
    rows: rows.slice(0, 100),
  };
}

async function loadAutomationDelta(db: Database, filters: Analytics2Filters) {
  const result = await db.execute(sql`
    with line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        coalesce(sum(
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
        ), 0)::double precision as product_cost
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), overlap as (
      select ${processedOrders.totalFees}::double precision as actual_fee,
        ${processedOrders.netRevenue}::double precision as actual_net,
        ${processedOrders.profit}::double precision as actual_profit,
        (${processedOrders.netRevenue} + ${processedOrders.totalFees})::double precision
          as canonical_collected,
        coalesce(
          ${ecotrackOrderStates.deliveryTariff}::double precision,
          ${ecotrackOrderStates.estimatedFee}::double precision
        ) as automated_fee,
        line_economics.product_cost
      from ${processedOrders}
      inner join ${orders}
        on ${orders.ecotrackTrackingNumber} = ${processedOrders.tracking}
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      inner join line_economics
        on line_economics.order_id = ${orders.id}
        and line_economics.cost_complete
      where coalesce(
          ${ecotrackOrderStates.deliveryTariff},
          ${ecotrackOrderStates.estimatedFee}
        ) is not null
        and ${datePredicate(
          sql`(coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt}) at time zone 'Africa/Algiers')::date`,
          filters.startDate,
          filters.endDate,
        )}
    ), comparison as (
      select *,
        canonical_collected - automated_fee as automated_net,
        canonical_collected - automated_fee - product_cost as automated_profit
      from overlap
    )
    select count(*)::int as orders,
      coalesce(sum(actual_fee), 0)::double precision as actual_fee,
      coalesce(sum(automated_fee), 0)::double precision as automated_fee,
      coalesce(sum(actual_net), 0)::double precision as actual_net,
      coalesce(sum(automated_net), 0)::double precision as automated_net,
      coalesce(sum(actual_profit), 0)::double precision as actual_profit,
      coalesce(sum(automated_profit), 0)::double precision as automated_profit,
      count(*) filter (where abs(actual_profit - automated_profit) <= 1)::int as exact_profit_orders,
      percentile_cont(0.95) within group (order by abs(actual_profit - automated_profit))
        ::double precision as p95_profit_error_dzd,
      avg(abs(actual_profit - automated_profit))::double precision as mean_profit_error_dzd
    from comparison
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const actualFee = numeric(row.actual_fee);
  const automatedFee = numeric(row.automated_fee);
  const actualNet = numeric(row.actual_net);
  const automatedNet = numeric(row.automated_net);
  const actualProfit = numeric(row.actual_profit);
  const automatedProfit = numeric(row.automated_profit);
  const ordersCount = numeric(row.orders);
  return {
    orders: ordersCount,
    fees: {
      actualDzd: actualFee,
      automatedDzd: automatedFee,
      differenceDzd: automatedFee - actualFee,
      differencePct: actualFee ? ((automatedFee - actualFee) / actualFee) * 100 : null,
    },
    netRecovered: {
      actualDzd: actualNet,
      automatedDzd: automatedNet,
      differenceDzd: automatedNet - actualNet,
      differencePct: actualNet ? ((automatedNet - actualNet) / actualNet) * 100 : null,
    },
    profit: {
      actualDzd: actualProfit,
      automatedDzd: automatedProfit,
      differenceDzd: automatedProfit - actualProfit,
      differencePct: actualProfit ? ((automatedProfit - actualProfit) / actualProfit) * 100 : null,
      exactOrders: numeric(row.exact_profit_orders),
      exactPct: ordersCount ? (numeric(row.exact_profit_orders) / ordersCount) * 100 : null,
      p95ErrorDzd: nullableNumeric(row.p95_profit_error_dzd),
      meanErrorDzd: nullableNumeric(row.mean_profit_error_dzd),
    },
  };
}

function weightedAverage(values: number[]) {
  if (!values.length) return null;
  const denominator = values.reduce((sum, _value, index) => sum + index + 1, 0);
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
}

function standardDeviation(values: number[], mean: number) {
  if (values.length < 2) return 0;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
}

export function buildEconomicsForecast(report: EconomicsReport, today: string, horizonDays = 14) {
  const completed = [...report.days]
    .filter((day) => day.date < today && day.trueProfitDzd != null)
    .reverse()
    .slice(-56);
  if (completed.length < 7) return [];
  const fallback = completed.slice(-14);

  return Array.from({ length: horizonDays }, (_, index) => {
    const date = addDays(today, index + 1);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const sameWeekday = completed
      .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === weekday)
      .slice(-8);
    const sample = sameWeekday.length >= 2 ? sameWeekday : fallback;
    const profits = sample.map((day) => day.trueProfitDzd as number);
    const orderCounts = sample.map((day) => day.postedOrders ?? 0);
    const forecastTrueProfitDzd = weightedAverage(profits) ?? 0;
    const spread = standardDeviation(profits, forecastTrueProfitDzd);
    return {
      date,
      forecastTrueProfitDzd,
      lowerTrueProfitDzd: forecastTrueProfitDzd - 1.28 * spread,
      upperTrueProfitDzd: forecastTrueProfitDzd + 1.28 * spread,
      forecastPostedOrders: weightedAverage(orderCounts) ?? 0,
      samples: sample.length,
      method: sameWeekday.length >= 2 ? 'weekday-weighted' : 'recent-weighted',
    } as const;
  });
}

async function loadEconomicsPair(db: Database, filters: Analytics2Filters) {
  const previousInput = previousEconomicsInput(filters);
  const [current, previous] = await Promise.all([
    getProfitTrackerReport(economicsInput(filters.startDate, filters.endDate), { db }),
    previousInput
      ? getProfitTrackerReport(previousInput, { db })
      : Promise.resolve<EconomicsReport | null>(null),
  ]);
  return { current, previous };
}

function economicsMetrics(current: EconomicsReport, previous: EconomicsReport | null) {
  return [
    metric(
      'trueProfit',
      current.summary.trueProfitDzd,
      previous?.summary.trueProfitDzd ?? null,
      'dzd',
    ),
    metric('profitX', current.summary.profitX, previous?.summary.profitX ?? null, 'ratio'),
    metric(
      'adjustedProfit',
      current.summary.adjustedProfitDzd,
      previous?.summary.adjustedProfitDzd ?? null,
      'dzd',
    ),
    metric('adCost', current.summary.rawAdCostDzd, previous?.summary.rawAdCostDzd ?? null, 'dzd'),
    metric(
      'postedOrders',
      current.summary.postedOrders,
      previous?.summary.postedOrders ?? null,
      'number',
    ),
    metric(
      'costPerPosted',
      current.summary.postedOrders > 0
        ? current.summary.ratioAdCostDzd / current.summary.postedOrders
        : null,
      previous && previous.summary.postedOrders > 0
        ? previous.summary.ratioAdCostDzd / previous.summary.postedOrders
        : null,
      'dzd',
    ),
  ];
}

function buildSignals(
  economics: EconomicsReport,
  returns: Analytics2ReturnObservation,
  fulfillment: Analytics2FulfillmentSummary,
) {
  const signals: Array<{
    key: string;
    severity: 'critical' | 'watch' | 'positive' | 'info';
    value: number | null;
    unit: Analytics2Metric['unit'];
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

function previousFilters(filters: Analytics2Filters): Analytics2Filters | null {
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

function sourceWarnings(sources: Analytics2Source[]) {
  return sources
    .filter((source) => source.state === 'missing' || source.state === 'partial')
    .map((source) => ({
      key: source.state === 'missing' ? 'sourceMissing' : 'sourcePartial',
      source: source.key,
      value: source.coveragePct,
    }));
}

function economicsWarnings(report: EconomicsReport) {
  const warnings: Array<{ key: string; value?: number | null }> = [];
  if (report.coverage.projectedCoveragePct != null && report.coverage.projectedCoveragePct < 100) {
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

async function loadCommandView(db: Database, filters: Analytics2Filters, today: string) {
  const prior = previousFilters(filters);
  const [
    economicsPair,
    overview,
    previousOverview,
    fulfillment,
    previousFulfillment,
    automaticPaid,
    previousAutomaticPaid,
    cashPipeline,
  ] = await Promise.all([
    loadEconomicsPair(db, filters),
    statsDashboard(statsInput(filters.startDate, filters.endDate)),
    prior ? statsDashboard(statsInput(prior.startDate, prior.endDate)) : Promise.resolve(null),
    loadFulfillmentSummary(db, filters.startDate, filters.endDate),
    prior ? loadFulfillmentSummary(db, prior.startDate, prior.endDate) : Promise.resolve(null),
    loadAutomaticPaidEconomics(db, filters),
    prior ? loadAutomaticPaidEconomics(db, prior) : Promise.resolve(null),
    loadCashPipeline(db, filters),
  ]);
  const { current, previous } = economicsPair;
  const [returns, sources] = await Promise.all([
    loadReturnObservation(db, filters, current.settings.defaultReturnRate),
    loadSourceHealth(db, filters, current),
  ]);
  const forecast = buildEconomicsForecast(current, today, 14);
  const forecastTrueProfitDzd = forecast
    .slice(0, 7)
    .reduce((sum, point) => sum + point.forecastTrueProfitDzd, 0);
  const paidByBucket = new Map(
    aggregateAutomaticPaidSeries(automaticPaid, filters.resolvedGrain).map((row) => [
      row.bucket,
      row.profitDzd,
    ]),
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
        ),
        metric(
          'paidOrders',
          fulfillment.paidOrders,
          previousFulfillment?.paidOrders ?? null,
          'number',
        ),
        metric(
          'storefrontConversion',
          overview.website.sessionConversionRate,
          previousOverview?.website.sessionConversionRate ?? null,
          'percent',
        ),
      ],
      economics: {
        summary: current.summary,
        realized: current.realized.summary,
        coverage: current.coverage,
        automaticPaid,
      },
      trajectory: aggregateEconomicsSeries(current, filters.resolvedGrain, today).map((point) => ({
        ...point,
        automaticPaidProfitDzd: paidByBucket.get(point.bucket) ?? null,
      })),
      fulfillment: {
        summary: fulfillment,
        cashPipeline,
        funnel: [
          { key: 'submitted', value: fulfillment.submittedOrders },
          { key: 'confirmed', value: fulfillment.confirmedOrders },
          { key: 'posted', value: fulfillment.postedOrders },
          { key: 'delivered', value: fulfillment.deliveredOrders },
          { key: 'paid', value: fulfillment.paidOrders },
        ],
      },
      storefront: {
        sessions: overview.website.sessions,
        engagedSessions: overview.website.engagedSessions,
        purchases: overview.website.purchases,
        conversionRate: overview.website.sessionConversionRate,
        trend: overview.website.trend,
      },
      returns,
      forecast: {
        days: forecast.slice(0, 7),
        nextSevenDayTrueProfitDzd: forecastTrueProfitDzd,
      },
      signals: buildSignals(current, returns, fulfillment),
    },
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}

async function loadMoneyView(db: Database, filters: Analytics2Filters, today: string) {
  const prior = previousFilters(filters);
  const { current, previous } = await loadEconomicsPair(db, filters);
  const [returns, sources, automaticPaid, previousAutomaticPaid, cohorts] = await Promise.all([
    loadReturnObservation(db, filters, current.settings.defaultReturnRate),
    loadSourceHealth(db, filters, current),
    loadAutomaticPaidEconomics(db, filters),
    prior ? loadAutomaticPaidEconomics(db, prior) : Promise.resolve(null),
    loadFulfillmentCohorts(
      db,
      filters.startDate,
      filters.endDate,
      current.settings.defaultReturnRate,
    ),
  ]);
  return {
    data: {
      kind: 'money' as const,
      metrics: [
        ...economicsMetrics(current, previous).slice(0, 3),
        metric(
          'automaticPaidProfit',
          automaticPaid.summary.profitDzd,
          previousAutomaticPaid?.summary.profitDzd ?? null,
          'dzd',
        ),
        economicsMetrics(current, previous)[3],
        metric('paidProfitCoverage', automaticPaid.summary.profitCoveragePct, null, 'percent'),
      ],
      summary: current.summary,
      realized: current.realized,
      coverage: current.coverage,
      freshness: current.freshness,
      settings: current.settings,
      returns,
      series: aggregateEconomicsSeries(current, filters.resolvedGrain, today),
      automaticPaid,
      paidSeries: aggregateAutomaticPaidSeries(automaticPaid, filters.resolvedGrain),
      cohorts,
      forecast: buildEconomicsForecast(current, today),
      weeks: current.weeks,
      days: current.days,
    },
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}

function aggregateMetaDaily(
  rows: Array<{
    day: string;
    spendEur: number;
    adCostDzd: number;
    impressions: number;
    linkClicks: number;
    outboundClicks: number;
  }>,
) {
  const groups = new Map<
    string,
    {
      day: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const row of rows) {
    const current = groups.get(row.day) ?? {
      day: row.day,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += row.spendEur;
    current.adCostDzd += row.adCostDzd;
    current.impressions += row.impressions;
    current.linkClicks += row.linkClicks;
    current.outboundClicks += row.outboundClicks;
    groups.set(row.day, current);
  }
  return [...groups.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((row) => ({
      ...row,
      ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
      outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
      cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    }));
}

async function loadAcquisitionView(db: Database, filters: Analytics2Filters, today: string) {
  const prior = previousFilters(filters);
  const { current, previous } = await loadEconomicsPair(db, filters);
  const [performance, previousPerformance, diagnostics, sources, breakdowns] = await Promise.all([
    loadMetaPerformance(db, filters, current),
    prior && previous ? loadMetaPerformance(db, prior, previous) : Promise.resolve(null),
    getStatsDashboardSection(statsInput(filters.startDate, filters.endDate), 'metaAds'),
    loadSourceHealth(db, filters, current),
    loadMetaBreakdowns(db, filters, current),
  ]);
  const summary = performance.summary;
  const old = previousPerformance?.summary;
  return {
    data: {
      kind: 'acquisition' as const,
      metrics: [
        metric('adCost', summary.adCostDzd, old?.adCostDzd ?? null, 'dzd'),
        metric('profitX', current.summary.profitX, previous?.summary.profitX ?? null, 'ratio'),
        metric('impressions', summary.impressions, old?.impressions ?? null, 'number'),
        metric('outboundClicks', summary.outboundClicks, old?.outboundClicks ?? null, 'number'),
        metric('postedOrders', summary.postedOrders, old?.postedOrders ?? null, 'number'),
        metric('costPerPosted', summary.costPerPostedDzd, old?.costPerPostedDzd ?? null, 'dzd'),
        metric(
          'costPerDelivered',
          summary.costPerDeliveredDzd,
          old?.costPerDeliveredDzd ?? null,
          'dzd',
        ),
        metric('costPerPaid', summary.costPerPaidDzd, old?.costPerPaidDzd ?? null, 'dzd'),
      ],
      summary,
      entities: performance.entities,
      entityDaily: performance.daily,
      breakdowns,
      daily: aggregateMetaDaily(performance.daily.ads),
      profitSeries: aggregateEconomicsSeries(current, filters.resolvedGrain, today).map(
        (point) => ({
          bucket: point.bucket,
          profitX: point.profitX,
          profitXBeforeReturns: point.profitXBeforeReturns,
        }),
      ),
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
        events: diagnostics.metaAds.events,
        health: diagnostics.metaAds.health ?? null,
        recentPayloads: diagnostics.metaAds.recentPayloads,
        paidAttribution: diagnostics.metaAds.paidAttribution,
      },
      sync: {
        canSyncActiveRange:
          filters.startDate != null && inclusiveDays(filters.startDate, filters.endDate) <= 90,
        maxDays: 90,
      },
    },
    sources,
    warnings: [...economicsWarnings(current), ...sourceWarnings(sources)],
  };
}

async function loadFulfillmentView(db: Database, filters: Analytics2Filters) {
  const prior = previousFilters(filters);
  const economics = await getProfitTrackerReport(
    economicsInput(filters.startDate, filters.endDate),
    { db },
  );
  const [fulfillment, previousSummary] = await Promise.all([
    loadFulfillmentData(db, filters, economics.settings.defaultReturnRate),
    prior ? loadFulfillmentSummary(db, prior.startDate, prior.endDate) : Promise.resolve(null),
  ]);
  const [returns, sources] = await Promise.all([
    loadReturnObservation(db, filters, economics.settings.defaultReturnRate),
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
        ),
        metric(
          'paidOrders',
          fulfillment.summary.paidOrders,
          previousSummary?.paidOrders ?? null,
          'number',
        ),
        metric('observedReturnRate', returns.mature.ratePct, null, 'percent'),
      ],
      ...fulfillment,
      returns,
      planningReturnRatePct: economics.settings.defaultReturnRate,
    },
    sources,
    warnings: [...sourceWarnings(sources)],
  };
}

async function loadStorefrontView(db: Database, filters: Analytics2Filters, now: Date) {
  const prior = previousStatsInput(filters);
  const [dashboard, previous, paths, sources] = await Promise.all([
    statsDashboard(statsInput(filters.startDate, filters.endDate)),
    prior ? statsDashboard(prior) : Promise.resolve(null),
    loadStorefrontPaths(db, filters, now),
    loadSourceHealth(db, filters),
  ]);
  const website = dashboard.website;
  const old = previous?.website;
  return {
    data: {
      kind: 'storefront' as const,
      metrics: [
        metric('sessions', website.sessions, old?.sessions ?? null, 'number'),
        metric('engagementRate', website.engagementRate, old?.engagementRate ?? null, 'percent'),
        metric('purchases', website.purchases, old?.purchases ?? null, 'number'),
        metric(
          'conversionRate',
          website.sessionConversionRate,
          old?.sessionConversionRate ?? null,
          'percent',
        ),
        metric('errorRate', website.errorRate, old?.errorRate ?? null, 'percent'),
        metric(
          'returningJourneys',
          website.returningJourneys,
          old?.returningJourneys ?? null,
          'number',
        ),
      ],
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
      funnel: website.funnel,
      trend: website.trend,
      searches: website.topSearches,
      productInterest: website.topProducts,
      pageTypes: website.pageTypes,
      acquisitionSources: website.acquisitionSources,
      locales: website.locales,
      devices: website.devices,
      vitals: website.vitals,
      paths,
      landingPages: dashboard.landingPages,
      aiAssistant: dashboard.aiAssistants.storefront,
    },
    sources,
    warnings: [
      ...(paths.coverageIsPartial
        ? [{ key: 'pathRetentionPartial', value: paths.coverageStartDate }]
        : []),
      ...sourceWarnings(sources),
    ],
  };
}

async function loadCatalogView(db: Database, filters: Analytics2Filters) {
  const prior = previousStatsInput(filters);
  const previousAnalytics = previousFilters(filters);
  const economics = await getProfitTrackerReport(
    economicsInput(filters.startDate, filters.endDate),
    { db },
  );
  const [
    dashboard,
    previous,
    basketPairs,
    sources,
    operationalProducts,
    previousOperationalProducts,
    operationalGeography,
    operationalCommunes,
    productMetaAssociations,
    customerEconomics,
    metaRegions,
  ] = await Promise.all([
    statsDashboard(statsInput(filters.startDate, filters.endDate)),
    prior ? statsDashboard(prior) : Promise.resolve(null),
    loadBasketPairs(db, filters),
    loadSourceHealth(db, filters),
    loadOperationalProducts(db, filters, economics.settings.defaultReturnRate),
    previousAnalytics
      ? loadOperationalProducts(db, previousAnalytics, economics.settings.defaultReturnRate)
      : Promise.resolve([] as OperationalProductRow[]),
    loadOperationalGeography(db, filters),
    loadOperationalCommunes(db, filters),
    loadProductMetaAssociations(db, filters),
    loadCustomerEconomics(db, filters, economics.settings.fxRate),
    loadMetaRegions(db, filters),
  ]);
  type CatalogProduct = {
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
  const currentProducts = dashboard.allProducts as CatalogProduct[];
  const oldProducts = (previous?.allProducts ?? []) as CatalogProduct[];
  const currentOperationalProducts = operationalProducts as OperationalProductRow[];
  const oldOperationalProducts = previousOperationalProducts as OperationalProductRow[];
  const currentOperationalGeography = operationalGeography as OperationalGeographyRow[];
  const settledProducts = new Map(currentProducts.map((row) => [row.id, row]));
  const oldSettledProducts = new Map(oldProducts.map((row) => [row.id, row]));
  const previousOperational = new Map<string, OperationalProductRow>(
    oldOperationalProducts.map((row) => [row.id, row]),
  );
  const metaByProduct = new Map<string, ProductMetaAssociation[]>();
  for (const association of productMetaAssociations) {
    const rows = metaByProduct.get(association.productId) ?? [];
    if (rows.length < 5) rows.push(association);
    metaByProduct.set(association.productId, rows);
  }
  const fallbackOperational: OperationalProductRow[] = currentProducts.map((row) => ({
    id: row.id,
    title: row.title,
    sku: row.sku,
    categoryName: row.categoryName,
    brandName: row.brandName,
    postedOrders: 0,
    postedUnits: 0,
    paidOrders: 0,
    paidUnits: 0,
    returnedOrders: 0,
    activeOrders: 0,
    terminalPaidRatePct: null,
    costCoveragePct: null,
    projectedContributionDzd: null,
    deliveryMedianHours: null,
    paymentMedianHours: null,
    deliverySamples: 0,
  }));
  const products = (
    currentOperationalProducts.length ? currentOperationalProducts : fallbackOperational
  )
    .slice(0, 100)
    .map((operational) => {
      const settled = settledProducts.get(operational.id);
      const oldOperational = previousOperational.get(operational.id);
      const oldSettled = oldSettledProducts.get(operational.id);
      return {
        id: operational.id,
        title: operational.title,
        sku: operational.sku ?? settled?.sku ?? null,
        categoryName: operational.categoryName ?? settled?.categoryName ?? null,
        brandName: operational.brandName ?? settled?.brandName ?? null,
        postedOrders: operational.postedOrders,
        postedUnits: operational.postedUnits,
        paidOrders: operational.paidOrders,
        paidUnits: operational.paidUnits,
        returnedOrders: operational.returnedOrders,
        activeOrders: operational.activeOrders,
        terminalPaidRatePct: operational.terminalPaidRatePct,
        costCoveragePct: operational.costCoveragePct,
        projectedContributionDzd: operational.projectedContributionDzd,
        deliveryMedianHours: operational.deliveryMedianHours,
        paymentMedianHours: operational.paymentMedianHours,
        deliverySamples: operational.deliverySamples,
        metaAssociations: metaByProduct.get(operational.id) ?? [],
        unitsSold: settled?.unitsSold ?? 0,
        revenue: settled?.revenue ?? 0,
        cost: settled?.cost ?? 0,
        profit: settled?.profit ?? 0,
        settledProfitDzd: settled?.profit ?? null,
        margin: settled?.margin ?? null,
        confirmationRate: settled?.confirmationRate ?? null,
        viewCount: settled?.viewCount ?? 0,
        addToCartCount: settled?.addToCartCount ?? 0,
        checkoutCount: settled?.checkoutCount ?? 0,
        websitePurchaseCount: settled?.websitePurchaseCount ?? 0,
        popularityScore: settled?.popularityScore ?? 0,
        websiteConversionRate: settled?.websiteConversionRate ?? 0,
        changes: {
          unitsPct: metricChange(operational.postedUnits, oldOperational?.postedUnits ?? null),
          profitPct: metricChange(settled?.profit ?? null, oldSettled?.profit ?? null),
          conversionPct: metricChange(
            settled?.websiteConversionRate ?? null,
            oldSettled?.websiteConversionRate ?? null,
          ),
        },
      };
    });
  const settledGeography = new Map(
    dashboard.wilayaDetails.map((row: { name: string }) => [row.name, row]),
  );
  const geography = currentOperationalGeography.map((row) => {
    const settled = settledGeography.get(row.name) as
      { orders?: number; profit?: number; revenue?: number; avgOrder?: number } | undefined;
    return {
      ...row,
      orders: row.postedOrders,
      profit: settled?.profit ?? null,
      settledOrders: settled?.orders ?? 0,
      settledRevenueDzd: settled?.revenue ?? null,
      avgOrder: settled?.avgOrder ?? null,
    };
  });
  return {
    data: {
      kind: 'catalog' as const,
      metrics: [
        metric(
          'postedUnits',
          currentOperationalProducts.reduce((sum, row) => sum + row.postedUnits, 0),
          previousAnalytics
            ? oldOperationalProducts.reduce((sum, row) => sum + row.postedUnits, 0)
            : null,
          'number',
        ),
        metric(
          'paidUnits',
          currentOperationalProducts.reduce((sum, row) => sum + row.paidUnits, 0),
          previousAnalytics
            ? oldOperationalProducts.reduce((sum, row) => sum + row.paidUnits, 0)
            : null,
          'number',
        ),
        metric(
          'productProfit',
          products.reduce((sum, row) => sum + (row.settledProfitDzd ?? 0), 0),
          previous ? oldProducts.reduce((sum, row) => sum + row.profit, 0) : null,
          'dzd',
        ),
        metric(
          'customers',
          customerEconomics.summary.customers,
          previous?.customers.summary.customers ?? null,
          'number',
        ),
        metric(
          'repeatRate',
          customerEconomics.summary.repeatRate,
          previous?.customers.summary.repeatRate ?? null,
          'percent',
        ),
      ],
      products,
      categories: dashboard.topCategories,
      brands: dashboard.topBrands,
      basketPairs,
      geography: {
        wilayas: geography,
        communes: operationalCommunes,
        metaRegions,
        deliveries: dashboard.deliveries,
      },
      customers: customerEconomics,
      sourceSemantics: {
        financials: 'settlement reference',
        demand: 'storefront',
        orders: 'posted cohort',
      },
    },
    sources,
    warnings: [...sourceWarnings(sources)],
  };
}

function costIsActiveOn(cost: EconomicsReport['costs'][number], date: string) {
  return cost.startDate <= date && (!cost.endDate || cost.endDate >= date);
}

async function loadAssumptionsView(db: Database, filters: Analytics2Filters) {
  const economics = await getProfitTrackerReport(
    economicsInput(filters.startDate, filters.endDate),
    { db },
  );
  const [returns, delta, sources] = await Promise.all([
    loadReturnObservation(db, filters, economics.settings.defaultReturnRate),
    loadAutomationDelta(db, filters),
    loadSourceHealth(db, filters, economics),
  ]);
  const activeMonthlyBurnDzd = economics.costs
    .filter((cost) => cost.period === 'monthly' && costIsActiveOn(cost, filters.endDate))
    .reduce((sum, cost) => sum + cost.amountDzd, 0);
  const oneTimeCostsDzd = economics.costs
    .filter(
      (cost) =>
        cost.period === 'once' &&
        (!filters.startDate || cost.startDate >= filters.startDate) &&
        cost.startDate <= filters.endDate,
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
      automationDelta: delta,
      formula: {
        adCost: 'metaSpendEur * fxRateUsed',
        adjustedProfit: 'grossProfitDzd * (1 - returnRatePct / 100)',
        netProfit: 'adjustedProfitDzd - adCostDzd',
        profitX: 'adjustedProfitDzd / adCostDzd',
        trueProfit: 'netProfitDzd - operatingCostDzd',
      },
    },
    sources,
    warnings: [...economicsWarnings(economics), ...sourceWarnings(sources)],
  };
}

async function loadSearchView(db: Database, filters: Analytics2Filters) {
  const search = await loadSearchAnalytics(db, filters);
  const previous = search.metrics.previous;
  const throughDate = search.source.throughDate;
  const lagDays = throughDate
    ? Math.max(0, inclusiveDays(throughDate.slice(0, 10), filters.endDate) - 1)
    : null;
  const source: Analytics2Source = {
    key: 'searchConsole',
    state:
      lagDays == null ? 'missing' : lagDays <= 4 ? 'current' : lagDays <= 7 ? 'lagged' : 'partial',
    updatedAt: search.source.updatedAt,
    throughDate,
    records: search.source.records,
    coveragePct: throughDate ? 100 : null,
  };
  const warnings: Array<{ key: string; source?: Analytics2Source['key']; value?: number | null }> =
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
    sources: [source],
    warnings,
  };
}

type LoadedAnalytics2Section =
  | Awaited<ReturnType<typeof loadCommandView>>
  | Awaited<ReturnType<typeof loadMoneyView>>
  | Awaited<ReturnType<typeof loadAcquisitionView>>
  | Awaited<ReturnType<typeof loadFulfillmentView>>
  | Awaited<ReturnType<typeof loadStorefrontView>>
  | Awaited<ReturnType<typeof loadSearchView>>
  | Awaited<ReturnType<typeof loadCatalogView>>
  | Awaited<ReturnType<typeof loadAssumptionsView>>;

export type Analytics2Payload = {
  view: Analytics2View;
  filters: Analytics2Filters;
  generatedAt: string;
  referenceDate: string;
  reviewClock: boolean;
  data: LoadedAnalytics2Section['data'];
  sources: Analytics2Source[];
  warnings: LoadedAnalytics2Section['warnings'];
  diagnostics: {
    queryDurationMs: number;
    responseSizeBytes: number;
  };
};

export async function getAnalytics2Data(
  query: Analytics2Query,
  options: { db?: Database; now?: Date } = {},
): Promise<Analytics2Payload> {
  const startedAt = performance.now();
  const db = options.db ?? getDb();
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.ANALYTICS2_REVIEW_CLOCK;
  const cutoffDate = reviewSetting
    ? await loadDatasetCutoffDate(db, query.view ?? 'command')
    : null;
  const clock = resolveAnalytics2ReferenceNow(reviewSetting, cutoffDate, wallNow);
  const now = clock.now;
  const effectiveQuery = clock.reviewClock ? clampQueryToReference(query, clock.referenceDate) : query;
  const filters = resolveAnalytics2Filters(effectiveQuery, now);
  const today = dayInTimezone(now);
  let loaded: LoadedAnalytics2Section;

  switch (filters.view) {
    case 'money':
      loaded = await loadMoneyView(db, filters, today);
      break;
    case 'acquisition':
      loaded = await loadAcquisitionView(db, filters, today);
      break;
    case 'fulfillment':
      loaded = await loadFulfillmentView(db, filters);
      break;
    case 'storefront':
      loaded = await loadStorefrontView(db, filters, now);
      break;
    case 'search':
      loaded = await loadSearchView(db, filters);
      break;
    case 'catalog':
      loaded = await loadCatalogView(db, filters);
      break;
    case 'assumptions':
      loaded = await loadAssumptionsView(db, filters);
      break;
    case 'command':
      loaded = await loadCommandView(db, filters, today);
      break;
  }

  const base = {
    view: filters.view,
    filters,
    generatedAt: now.toISOString(),
    referenceDate: clock.referenceDate,
    reviewClock: clock.reviewClock,
    data: loaded.data,
    sources: loaded.sources,
    warnings: loaded.warnings,
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  } satisfies Analytics2Payload;
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
