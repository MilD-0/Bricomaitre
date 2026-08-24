import { sql, type SQLWrapper } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsEconomicsDailyFacts,
  analyticsOrderCohortFacts,
  analyticsDailyRollups,
  analyticsEvents,
  brands,
  categories,
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
  profitTrackerOperatingCosts,
  profitTrackerSettings,
  products as productCatalog,
} from '@bric/db/schema';
import { CONFIRMED_LIFECYCLE_ORDER_STATUSES } from '@bric/storefront-core/order-domain';

import {
  getProfitTrackerReport,
  getProfitTrackerSettings,
  listProfitTrackerCosts,
  type ProfitTrackerRangeInput,
} from './profit-tracker';
import {
  ANALYTICS2_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from './analytics2-fact-contract';
import {
  ANALYTICS_RESOLVED_SHIPMENT_STATUSES,
  effectiveEcotrackStatusSql,
} from './ecotrack-status-policy';
import {
  getCanonicalStorefrontSessionCount,
  getLiveStorefrontAnalytics,
  getLiveWebsiteProductMetrics,
  getStatsDashboardSection,
  type LiveWebsiteProductMetric,
  type StatsFilters,
} from './stats';
import { loadSearchAnalytics, loadSearchThroughDate } from './analytics2-search';
import {
  ISO_DATE_PATTERN,
  type Analytics2AutomaticPaidDay,
  type Analytics2AutomaticPaidEconomics,
  type Analytics2CashStage,
  type Analytics2EffectiveRange,
  type Analytics2EntityLevel,
  type Analytics2Filters,
  type Analytics2LeadingOrderForecast,
  type Analytics2Metric,
  type Analytics2Query,
  type Analytics2Source,
  type Analytics2View,
} from './analytics2/contract';
import {
  addDays,
  clampQueryToReference,
  clipAnalytics2Filters,
  dayInTimezone,
  inclusiveDays,
  resolveAnalytics2Filters,
  resolveAnalytics2ReferenceNow,
} from './analytics2/date-range';
import {
  aggregateAutomaticPaidSeries,
  aggregateEconomicsSeries,
  fridayWeekStart,
} from './analytics2/economics-series';
import {
  buildEconomicsForecast,
  buildLeadingOrderForecast,
  projectOpenEconomicsSeries,
} from './analytics2/forecast';
import { metricChange, ratio, returnRate } from './analytics2/metrics';

export { analytics2QuerySchema } from './analytics2/contract';
export type {
  Analytics2AutomaticPaidEconomics,
  Analytics2CashStage,
  Analytics2EffectiveRange,
  Analytics2EntityLevel,
  Analytics2Filters,
  Analytics2Grain,
  Analytics2Metric,
  Analytics2Query,
  Analytics2Range,
  Analytics2ResolvedGrain,
  Analytics2Source,
  Analytics2View,
} from './analytics2/contract';
export {
  clipAnalytics2Filters,
  resolveAnalytics2Filters,
  resolveAnalytics2ReferenceNow,
} from './analytics2/date-range';
export {
  aggregateAutomaticPaidSeries,
  aggregateEconomicsSeries,
} from './analytics2/economics-series';
export {
  buildEconomicsForecast,
  buildLeadingOrderForecast,
  projectOpenEconomicsSeries,
} from './analytics2/forecast';
export { metricChange } from './analytics2/metrics';

type Database = ReturnType<typeof getDb>;
type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

type Analytics2ReturnObservation = {
  planningRatePct: number;
  mature: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
    cutoffDate: string;
    eligibleOrders: number;
    terminalCoveragePct: number | null;
    cohortStartDate: string | null;
    cohortEndDate: string | null;
  };
  allTerminal: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
  };
};

type Analytics2FulfillmentSummary = {
  submittedOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  untrackedShipments: number;
  activeShipments: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  terminalOrders: number;
  observedReturnRatePct: number | null;
  matureObservedReturnRatePct: number | null;
};

type Analytics2MetaEntity = {
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
  attributedAdCostDzd: number;
  outcomeSpendCoveragePct: number | null;
  projectedAdjustedProfitDzd: number;
  automaticPaidProfitDzd: number;
  profitCompleteOrders: number;
  projectedProfitX: number | null;
  paidProfitX: number | null;
  profitCoveragePct: number | null;
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

async function loadDatasetCutoffDate(db: Database) {
  const cutoff = sql`greatest(
    (select max(day) from admin.analytics_economics_daily_facts),
    (select max(posted_day) from admin.analytics_order_cohort_facts),
    (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}),
    (select max(${profitTrackerDays.day}) from ${profitTrackerDays}),
    (select max((${orders.createdAt} at time zone 'Africa/Algiers')::date) from ${orders}),
    (select max(${ecotrackOrderTrackingEvents.eventDate}) from ${ecotrackOrderTrackingEvents}),
    (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
      from ${analyticsEvents}),
    (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}),
    (select max(day) from search_console_daily_totals)
  )`;
  const result = await db.execute(sql`
    select to_char(${cutoff}, 'YYYY-MM-DD') as cutoff_date
  `);
  const value = (result.rows[0] as { cutoff_date?: unknown } | undefined)?.cutoff_date;
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
}

type Analytics2CanonicalCutoffs = {
  orders: string | null;
  ordersFrom: string | null;
  posted: string | null;
  postedFrom: string | null;
  ecotrack: string | null;
  ecotrackFrom: string | null;
  paidFrom: string | null;
  meta: string | null;
  metaFrom: string | null;
  storefront: string | null;
  storefrontFrom: string | null;
};

async function loadCanonicalCutoffs(db: Database): Promise<Analytics2CanonicalCutoffs> {
  const result = await db.execute(sql`
    select
      to_char(max((${orders.createdAt} at time zone 'Africa/Algiers')::date), 'YYYY-MM-DD')
        as orders_through,
      to_char(min((${orders.createdAt} at time zone 'Africa/Algiers')::date), 'YYYY-MM-DD')
        as orders_from,
      to_char((select max((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
        from ${orderStatusHistory} where ${orderStatusHistory.status} = 11), 'YYYY-MM-DD')
        as posted_through,
      to_char((select min((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
        from ${orderStatusHistory} where ${orderStatusHistory.status} = 11), 'YYYY-MM-DD')
        as posted_from,
      to_char((select max((coalesce(
        ${ecotrackOrderStates.lastOrderSyncedAt},
        ${ecotrackOrderStates.lastStatusSyncedAt},
        ${ecotrackOrderStates.updatedAt}
      ) at time zone 'Africa/Algiers')::date) from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null), 'YYYY-MM-DD') as ecotrack_through,
      to_char((select min(${ecotrackOrderTrackingEvents.eventDate})
        from ${ecotrackOrderTrackingEvents}), 'YYYY-MM-DD') as ecotrack_from,
      to_char((select min(${ecotrackOrderTrackingEvents.eventDate})
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'payed'), 'YYYY-MM-DD') as paid_from,
      to_char((select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}), 'YYYY-MM-DD')
        as meta_through,
      to_char((select min(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}), 'YYYY-MM-DD')
        as meta_from,
      to_char(greatest(
        (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}),
        (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
          from ${analyticsEvents})
      ), 'YYYY-MM-DD') as storefront_through,
      to_char((
        with storefront_days as (
          select ${analyticsDailyRollups.day} as day
          from ${analyticsDailyRollups}
          where ${analyticsDailyRollups.dimension} = 'overall'
            and ${analyticsDailyRollups.dimensionKey} = ''
          union
          select (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date as day
          from ${analyticsEvents}
        ), ordered_days as (
          select day, lag(day) over (order by day) as previous_day
          from storefront_days
        )
        select coalesce(
          max(day) filter (where previous_day is not null and day - previous_day > 7),
          min(day)
        )
        from ordered_days
      ), 'YYYY-MM-DD') as storefront_from
    from ${orders}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const date = (value: unknown) =>
    typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
  return {
    orders: date(row.orders_through),
    ordersFrom: date(row.orders_from),
    posted: date(row.posted_through),
    postedFrom: date(row.posted_from),
    ecotrack: date(row.ecotrack_through),
    ecotrackFrom: date(row.ecotrack_from),
    paidFrom: date(row.paid_from),
    meta: date(row.meta_through),
    metaFrom: date(row.meta_from),
    storefront: date(row.storefront_through),
    storefrontFrom: date(row.storefront_from),
  };
}

function commonCutoff(...dates: Array<string | null>) {
  if (dates.some((date) => date == null)) return null;
  return [...(dates as string[])].sort().at(0) ?? null;
}

function commonCoverageStart(...dates: Array<string | null>) {
  if (dates.some((date) => date == null)) return null;
  return [...(dates as string[])].sort().at(-1) ?? null;
}

function statsInput(startDate: string | null, endDate: string): StatsFilters {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

function economicsInput(startDate: string | null, endDate: string): ProfitTrackerRangeInput {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

function effectiveRange(
  key: string,
  filters: Analytics2Filters,
  sources: Analytics2Source['key'][],
): Analytics2EffectiveRange {
  return { key, startDate: filters.startDate, endDate: filters.endDate, sources };
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

function fulfillmentPhase(status: string) {
  if (status === 'paye_et_archive' || status === 'payed') return 'paid';
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

const resolvedShipmentStatusesSql = sql.join(
  ANALYTICS_RESOLVED_SHIPMENT_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

function stateAwareContributionSql(input: {
  grossProfit: SQLWrapper;
  currentStatus: SQLWrapper;
  deliveredAt: SQLWrapper;
  planningReturnRatePct: SQLWrapper;
}) {
  return sql<number | null>`case
    when ${input.grossProfit} is null then null
    when ${input.planningReturnRatePct}::double precision = 100 then 0
    when ${input.currentStatus} in ('retour_archive', 'annule', 'failed') then 0
    when ${input.currentStatus} in ('paye_et_archive', 'payed', 'manual_completed')
      or ${input.deliveredAt} is not null then ${input.grossProfit}::double precision
    else ${input.grossProfit}::double precision
      * (1 - ${input.planningReturnRatePct}::double precision / 100)
  end`;
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
        ${orderStatusHistory.changedAt} as posted_at,
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
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), posted_cohort as (
      select first_posted.order_id,
        first_posted.posted_day,
        ${effectiveEcotrackStatusSql({
          localStatus: orders.confirmed,
          providerStatus: ecotrackOrderStates.currentStatus,
          latestActivityAt: sql`lifecycle.latest_activity_at`,
          fallbackActivityAt: sql`coalesce(
            ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
            first_posted.posted_at at time zone 'Africa/Algiers'
          )`,
          referenceAt: sql`${endDate}::date + interval '1 day'`,
        })} as current_status,
        lifecycle.delivered_at
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join lifecycle on lifecycle.order_id = first_posted.order_id
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
        where current_status = 'untracked'
      )::int as untracked_shipments,
      count(*) filter (
        where current_status <> 'untracked'
          and current_status not in (${resolvedShipmentStatusesSql})
      )::int as active_shipments,
      count(delivered_at)::int as delivered_orders,
      count(*) filter (where current_status in ('paye_et_archive', 'payed'))::int as paid_orders,
      count(*) filter (where current_status = 'retour_archive')::int as returned_orders,
      count(*) filter (where current_status = 'annule')::int as cancelled_orders,
      count(*) filter (where current_status in ('paye_et_archive', 'retour_archive'))::int
        as terminal_orders,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date
          and current_status in ('paye_et_archive', 'payed')
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
    untrackedShipments: numeric(row.untracked_shipments),
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
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), cohort as (
      select first_posted.posted_day,
        ${effectiveEcotrackStatusSql({
          localStatus: orders.confirmed,
          providerStatus: ecotrackOrderStates.currentStatus,
          latestActivityAt: sql`lifecycle.latest_activity_at`,
          fallbackActivityAt: sql`coalesce(
            ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
            first_posted.posted_at
          )`,
          referenceAt: sql`${filters.endDate}::date + interval '1 day'`,
        })} as current_status
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join lifecycle on lifecycle.order_id = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    )
    select
      count(*) filter (where current_status in ('paye_et_archive', 'payed'))::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date
          and current_status in ('paye_et_archive', 'payed')
      )::int as mature_paid,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'retour_archive'
      )::int as mature_returned,
      count(*) filter (where posted_day <= ${matureCutoffDate}::date)::int as mature_eligible
    from cohort
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const paid = numeric(row.paid);
  const returned = numeric(row.returned);
  const maturePaid = numeric(row.mature_paid);
  const matureReturned = numeric(row.mature_returned);
  const matureEligible = numeric(row.mature_eligible);
  return {
    planningRatePct,
    mature: {
      ratePct: returnRate(matureReturned, maturePaid),
      paid: maturePaid,
      returned: matureReturned,
      terminal: maturePaid + matureReturned,
      cutoffDate: matureCutoffDate,
      eligibleOrders: matureEligible,
      terminalCoveragePct: ratio(maturePaid + matureReturned, matureEligible),
      cohortStartDate: filters.startDate,
      cohortEndDate:
        !filters.startDate || filters.startDate <= matureCutoffDate ? matureCutoffDate : null,
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
  profitsSuppressed = false,
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
        sum(${orderLineItems.lineTotal})::double precision as product_revenue,
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
        line_economics.product_revenue,
        case when line_economics.cost_complete then line_economics.product_cost else coalesce(
          line_economics.product_revenue * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE},
          (case
            when ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
              and ${ecotrackOrderStates.currentAmount} is not null
              then ${ecotrackOrderStates.currentAmount}::double precision
            when ${processedOrders.id} is not null
              then (${processedOrders.netRevenue} + ${processedOrders.totalFees})::double precision
            when ${ecotrackOrderStates.currentAmount} is not null
              then ${ecotrackOrderStates.currentAmount}::double precision
            else ${orders.totalAmount}::double precision
          end) * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
        ) end as product_cost
      from ${ecotrackOrderStates}
      inner join ${orders} on ${orders.id} = ${ecotrackOrderStates.orderId}
      left join paid_events on paid_events.order_id = ${ecotrackOrderStates.orderId}
      left join paid_observations on paid_observations.order_id = ${ecotrackOrderStates.orderId}
      left join paid_local on paid_local.order_id = ${ecotrackOrderStates.orderId}
      left join line_economics on line_economics.order_id = ${ecotrackOrderStates.orderId}
      left join ${processedOrders}
        on ${processedOrders.tracking} = ${ecotrackOrderStates.trackingNumber}
      where ${ecotrackOrderStates.deletedAt} is null
        and ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
    )
    select (paid_at at time zone 'Africa/Algiers')::date::text as day,
      count(*)::int as paid_orders,
      coalesce(sum(cod_amount) filter (where cod_amount is not null), 0)::double precision as cod,
      coalesce(sum(fee_amount) filter (where fee_amount is not null), 0)::double precision as fees,
      coalesce(sum(cod_amount - fee_amount)
        filter (where cod_amount is not null and fee_amount is not null), 0)::double precision
        as net_recovered,
      coalesce(sum(product_cost) filter (where product_cost is not null), 0)::double precision
        as product_cost,
      coalesce(sum(cod_amount - fee_amount - product_cost) filter (
        where cod_amount is not null and fee_amount is not null and product_cost is not null
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
        profitDzd: profitsSuppressed ? 0 : numeric(row.profit),
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

async function loadLeadingOrderForecast(
  db: Database,
  filters: Analytics2Filters,
  settings: Awaited<ReturnType<typeof getProfitTrackerSettings>>,
) {
  const historicalStartDate = addDays(filters.endDate, -111);
  const historicalEndDate = addDays(filters.endDate, -21);
  const recentPendingStart = addDays(filters.endDate, -20);
  const pendingStartDate =
    filters.startDate && filters.startDate > recentPendingStart
      ? filters.startDate
      : recentPendingStart;
  const confirmedStatuses = sql.join(
    [...CONFIRMED_LIFECYCLE_ORDER_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    with lifecycle as (
      select ${orderStatusHistory.orderId} as order_id,
        min(${orderStatusHistory.changedAt}) filter (
          where ${orderStatusHistory.status} in (${confirmedStatuses})
        ) as confirmed_at,
        min(${orderStatusHistory.changedAt}) filter (
          where ${orderStatusHistory.status} = 11
        ) as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.changedAt} < ${filters.endDate}::date + interval '1 day'
      group by ${orderStatusHistory.orderId}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        sum(
          ${orderLineItems.lineTotal} - coalesce(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
            ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          )
        )::double precision as gross_profit
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), historical as (
      select ${orders.id} as order_id,
        ${orders.createdAt} as submitted_at,
        ${orders.confirmed} as current_status,
        lifecycle.confirmed_at,
        coalesce(lifecycle.posted_at, ${ecotrackOrderStates.providerCreatedAt}) as posted_at,
        ${ecotrackOrderStates.orderId} as shipment_order_id
      from ${orders}
      left join lifecycle on lifecycle.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      where (${orders.createdAt} at time zone 'Africa/Algiers')::date
        between ${historicalStartDate}::date and ${historicalEndDate}::date
    ), timing as (
      select
        percentile_cont(0.5) within group (
          order by extract(epoch from (posted_at - submitted_at)) / 3600
        ) filter (where posted_at is not null) as median_submitted_to_posted_hours,
        percentile_cont(0.5) within group (
          order by extract(epoch from (posted_at - confirmed_at)) / 3600
        ) filter (where posted_at is not null and confirmed_at is not null)
          as median_confirmed_to_posted_hours,
        percentile_cont(0.95) within group (
          order by extract(epoch from (confirmed_at - submitted_at)) / 3600
        ) filter (where confirmed_at is not null) as p95_submitted_to_confirmed_hours,
        percentile_cont(0.95) within group (
          order by extract(epoch from (posted_at - confirmed_at)) / 3600
        ) filter (where posted_at is not null and confirmed_at is not null)
          as p95_confirmed_to_posted_hours
      from historical
    ), pending as (
      select case
          when ${orders.confirmed} in (2, 5) then 'confirmed'
          when ${orders.confirmed} in (0, 1) then 'submitted'
          else null
        end as stage,
        ${orders.totalAmount}::double precision as cod_dzd,
        coalesce(
          line_economics.gross_profit,
          ${orders.totalAmount}::double precision * ${ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
        ) as gross_profit_dzd
      from ${orders}
      left join lifecycle on lifecycle.order_id = ${orders.id}
      left join line_economics on line_economics.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      cross join timing
      where (${orders.createdAt} at time zone 'Africa/Algiers')::date
        between ${pendingStartDate}::date and ${filters.endDate}::date
        and lifecycle.posted_at is null
        and ${ecotrackOrderStates.orderId} is null
        and ${orders.confirmed} in (0, 1, 2, 5)
        and (
          (${orders.confirmed} in (0, 1) and ${orders.createdAt} >=
            ${filters.endDate}::date + interval '1 day'
              - greatest(
                  24,
                  least(168, coalesce(timing.p95_submitted_to_confirmed_hours, 72))
                ) * interval '1 hour')
          or
          (${orders.confirmed} in (2, 5) and coalesce(
            lifecycle.confirmed_at,
            ${orders.confirmedAt},
            ${orders.createdAt}
          ) >= ${filters.endDate}::date + interval '1 day'
              - greatest(
                  24,
                  least(168, coalesce(timing.p95_confirmed_to_posted_hours, 72))
                ) * interval '1 hour')
        )
    )
    select
      (select count(*)::int from historical) as historical_submitted,
      (select count(*) filter (
        where confirmed_at is not null or current_status in (${confirmedStatuses})
      )::int from historical)
        as historical_confirmed,
      (select count(*) filter (
        where posted_at is not null or shipment_order_id is not null
      )::int from historical)
        as historical_posted,
      (select median_submitted_to_posted_hours from timing)
        as median_submitted_to_posted_hours,
      (select median_confirmed_to_posted_hours from timing)
        as median_confirmed_to_posted_hours,
      count(*) filter (where stage = 'submitted')::int as submitted_orders,
      coalesce(sum(cod_dzd) filter (where stage = 'submitted'), 0)::double precision
        as submitted_cod_dzd,
      coalesce(sum(gross_profit_dzd) filter (where stage = 'submitted'), 0)::double precision
        as submitted_gross_profit_dzd,
      count(*) filter (where stage = 'confirmed')::int as confirmed_orders,
      coalesce(sum(cod_dzd) filter (where stage = 'confirmed'), 0)::double precision
        as confirmed_cod_dzd,
      coalesce(sum(gross_profit_dzd) filter (where stage = 'confirmed'), 0)::double precision
        as confirmed_gross_profit_dzd
    from pending
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return buildLeadingOrderForecast({
    asOfDate: filters.endDate,
    historicalStartDate,
    historicalEndDate,
    historicalSubmittedOrders: numeric(row.historical_submitted),
    historicalConfirmedOrders: numeric(row.historical_confirmed),
    historicalPostedOrders: numeric(row.historical_posted),
    submittedOrders: numeric(row.submitted_orders),
    submittedCodDzd: numeric(row.submitted_cod_dzd),
    submittedGrossProfitDzd: numeric(row.submitted_gross_profit_dzd),
    confirmedOrders: numeric(row.confirmed_orders),
    confirmedCodDzd: numeric(row.confirmed_cod_dzd),
    confirmedGrossProfitDzd: numeric(row.confirmed_gross_profit_dzd),
    medianSubmittedToPostedHours: nullableNumeric(row.median_submitted_to_posted_hours),
    medianConfirmedToPostedHours: nullableNumeric(row.median_confirmed_to_posted_hours),
    planningReturnRatePct: settings.defaultReturnRate,
    restFrom: settings.restFrom,
  });
}

async function loadCashPipeline(
  db: Database,
  filters: Analytics2Filters,
): Promise<Analytics2CashStage[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), effective as (
      select ${effectiveEcotrackStatusSql({
        localStatus: orders.confirmed,
        providerStatus: ecotrackOrderStates.currentStatus,
        latestActivityAt: sql`lifecycle.latest_activity_at`,
        fallbackActivityAt: sql`coalesce(
          ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
          first_posted.posted_at
        )`,
        referenceAt: sql`${filters.endDate}::date + interval '1 day'`,
      })} as current_status,
        coalesce(
          ${ecotrackOrderStates.currentAmount}::double precision,
          ${orders.totalAmount}::double precision
        ) as amount,
        ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders' as provider_amount
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join lifecycle on lifecycle.order_id = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    ), pipeline as (
      select case
          when current_status in (
            'prete_a_expedier', 'en_ramassage', 'en_preparation_stock', 'en_preparation',
            'vers_hub', 'en_hub', 'vers_wilaya', 'en_livraison', 'suspendu'
          ) then 'inTransit'
          when current_status = 'livre_non_encaisse' then 'deliveredAwaitingCollection'
          when current_status = 'encaisse_non_paye' then 'collectedAwaitingPayout'
          when current_status = 'paiements_prets' then 'paymentReady'
          else null
        end as stage,
        amount,
        provider_amount
      from effective
    )
    select stage,
      count(*)::int as orders,
      coalesce(sum(amount), 0)::double precision as amount,
      count(*) filter (where provider_amount)::int as provider_amount_orders
    from pipeline
    where stage is not null
    group by stage
  `);
  const order: Analytics2CashStage['key'][] = [
    'inTransit',
    'deliveredAwaitingCollection',
    'collectedAwaitingPayout',
    'paymentReady',
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
      medianAgeHours: null,
      oldestAgeHours: null,
      staleOrders: 0,
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

function withLeadingCashStages(
  rows: Analytics2CashStage[],
  leading: Analytics2LeadingOrderForecast,
) {
  const leadingRows: Analytics2CashStage[] = [
    {
      key: 'submitted',
      orders: leading.stages.submitted.orders,
      amountDzd: leading.stages.submitted.codDzd,
      providerAmountCoveragePct: null,
      medianAgeHours: null,
      oldestAgeHours: null,
      staleOrders: 0,
      confidencePct: leading.stages.submitted.confidencePct,
    },
    {
      key: 'confirmed',
      orders: leading.stages.confirmed.orders,
      amountDzd: leading.stages.confirmed.codDzd,
      providerAmountCoveragePct: null,
      medianAgeHours: null,
      oldestAgeHours: null,
      staleOrders: 0,
      confidencePct: leading.stages.confirmed.confidencePct,
    },
  ];
  return [...leadingRows, ...rows];
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
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), cohort as (
      select ${effectiveEcotrackStatusSql({
        localStatus: orders.confirmed,
        providerStatus: ecotrackOrderStates.currentStatus,
        latestActivityAt: sql`lifecycle.latest_activity_at`,
        fallbackActivityAt: sql`coalesce(
          ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
          first_posted.posted_at
        )`,
        referenceAt: sql`${endDate}::date + interval '1 day'`,
      })} as current_status,
        coalesce(
          lifecycle.latest_activity_at,
          ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
          first_posted.posted_at
        ) as activity_at,
        ${endDate}::date + interval '1 day' as reference_at
      from first_posted
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join lifecycle on lifecycle.order_id = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    )
    select current_status,
      count(*)::int as orders,
      count(*) filter (
        where current_status not in (${resolvedShipmentStatusesSql})
          and reference_at - activity_at > interval '48 hours'
      )::int as stale_orders,
      percentile_cont(0.5) within group (
        order by extract(epoch from (reference_at - activity_at)) / 3600
      ) filter (
        where current_status not in (${resolvedShipmentStatusesSql})
      )::double precision as median_age_hours,
      min(activity_at) filter (
        where current_status not in (${resolvedShipmentStatusesSql})
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

async function loadAttemptDistribution(
  db: Database,
  startDate: string | null,
  endDate: string,
  useMaterializedFacts = false,
) {
  const result = useMaterializedFacts
    ? await db.execute(sql`
      select ${analyticsOrderCohortFacts.outcome} as outcome,
        case when ${analyticsOrderCohortFacts.attemptCount} >= 4
          then '4+' else ${analyticsOrderCohortFacts.attemptCount}::text end as attempt_band,
        count(*)::int as orders,
        avg(${analyticsOrderCohortFacts.attemptCount})::double precision as average_attempts
      from ${analyticsOrderCohortFacts}
      where ${datePredicate(analyticsOrderCohortFacts.postedDay, startDate, endDate)}
        and ${analyticsOrderCohortFacts.outcome} in ('paye_et_archive', 'retour_archive')
        and ${analyticsOrderCohortFacts.semanticsVersion}
          = ${ANALYTICS2_FACT_SEMANTICS_VERSION}
      group by ${analyticsOrderCohortFacts.outcome},
        case when ${analyticsOrderCohortFacts.attemptCount} >= 4
          then '4+' else ${analyticsOrderCohortFacts.attemptCount}::text end
      order by ${analyticsOrderCohortFacts.outcome}, attempt_band
    `)
    : await db.execute(sql`
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
  economics: EconomicsReport,
) {
  const planningReturnRatePct = economics.settings.defaultReturnRate;
  const economicsByWeek = new Map(economics.weeks.map((week) => [week.weekStart, week]));
  const matureCutoffDate = addDays(endDate, -21);
  const effectiveCohortStatus = effectiveEcotrackStatusSql({
    localStatus: orders.confirmed,
    providerStatus: ecotrackOrderStates.currentStatus,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
      first_posted.posted_at
    )`,
    referenceAt: sql`${endDate}::date + interval '1 day'`,
  });
  const result = (economics as EconomicsReport & { materializedFacts?: boolean }).materializedFacts
    ? await db.execute(sql`
    with cohort as (
      select (
          ${analyticsOrderCohortFacts.postedDay}
          - (((extract(dow from ${analyticsOrderCohortFacts.postedDay})::int - 5 + 7) % 7))::int
        )::date as week_start,
        ${analyticsOrderCohortFacts.postedDay} as posted_day,
        ${analyticsOrderCohortFacts.outcome} as current_status,
        ${analyticsOrderCohortFacts.deliveredAt} as delivered_at,
        ${analyticsOrderCohortFacts.costComplete} as cost_complete,
        ${stateAwareContributionSql({
          grossProfit: analyticsOrderCohortFacts.grossProfitDzd,
          currentStatus: analyticsOrderCohortFacts.outcome,
          deliveredAt: analyticsOrderCohortFacts.deliveredAt,
          planningReturnRatePct: sql`${planningReturnRatePct}`,
        })} as projected_contribution,
        case when ${analyticsOrderCohortFacts.grossProfitDzd} is not null then
          ${analyticsOrderCohortFacts.grossProfitDzd}::double precision
        end as comparable_gross_profit
      from ${analyticsOrderCohortFacts}
      where ${datePredicate(analyticsOrderCohortFacts.postedDay, startDate, endDate)}
        and ${analyticsOrderCohortFacts.semanticsVersion}
          = ${ANALYTICS2_FACT_SEMANTICS_VERSION}
    )
    select week_start::text,
      count(*)::int as posted,
      count(*) filter (where current_status in ('paye_et_archive', 'payed'))::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (where delivered_at is not null)::int as delivered,
      count(*) filter (
        where current_status <> 'untracked'
          and current_status not in (${resolvedShipmentStatusesSql})
      )::int as active,
      coalesce(sum(projected_contribution), 0)::double precision as projected_contribution,
      case when ${planningReturnRatePct}::double precision = 100 then 0 else
        coalesce(sum(comparable_gross_profit) filter (
          where delivered_at is not null and current_status <> 'retour_archive'
        ), 0)::double precision end as delivered_contribution,
      case when ${planningReturnRatePct}::double precision = 100 then 0 else
        coalesce(sum(comparable_gross_profit) filter (
          where current_status in ('paye_et_archive', 'payed')
        ), 0)::double precision end as paid_contribution,
      count(*) filter (where cost_complete)::int as cost_complete_orders,
      bool_and(posted_day <= ${matureCutoffDate}::date)
        and count(*) filter (
          where current_status = 'untracked'
             or current_status not in (${resolvedShipmentStatusesSql})
        ) = 0 as mature
    from cohort
    group by week_start
    order by week_start desc
    limit 18
  `)
    : await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        sum(${orderLineItems.lineTotal})::double precision as product_revenue,
        sum(
          coalesce(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
            ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          )
        )::double precision as estimated_product_cost
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), cohort as (
      select (
          first_posted.posted_day
          - (((extract(dow from first_posted.posted_day)::int - 5 + 7) % 7))::int
        )::date as week_start,
        first_posted.posted_day,
        ${effectiveCohortStatus} as current_status,
        lifecycle.delivered_at,
        line_economics.cost_complete,
        ${stateAwareContributionSql({
          grossProfit: sql`line_economics.product_revenue
            - line_economics.estimated_product_cost`,
          currentStatus: effectiveCohortStatus,
          deliveredAt: sql`lifecycle.delivered_at`,
          planningReturnRatePct: sql`${planningReturnRatePct}`,
        })} as projected_contribution,
        case when line_economics.product_revenue is not null then
          line_economics.product_revenue - line_economics.estimated_product_cost
        end as comparable_gross_profit
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join lifecycle on lifecycle.order_id = first_posted.order_id
      left join line_economics on line_economics.order_id = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
    )
    select week_start::text,
      count(*)::int as posted,
      count(*) filter (where current_status in ('paye_et_archive', 'payed'))::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (where delivered_at is not null)::int as delivered,
      count(*) filter (
        where current_status <> 'untracked'
          and current_status not in (${resolvedShipmentStatusesSql})
      )::int as active,
      coalesce(sum(projected_contribution), 0)::double precision as projected_contribution,
      case when ${planningReturnRatePct}::double precision = 100 then 0 else
        coalesce(sum(comparable_gross_profit) filter (
          where delivered_at is not null and current_status <> 'retour_archive'
        ), 0)::double precision end as delivered_contribution,
      case when ${planningReturnRatePct}::double precision = 100 then 0 else
        coalesce(sum(comparable_gross_profit) filter (
          where current_status in ('paye_et_archive', 'payed')
        ), 0)::double precision end as paid_contribution,
      count(*) filter (where cost_complete)::int as cost_complete_orders,
      bool_and(posted_day <= ${matureCutoffDate}::date)
        and count(*) filter (
          where current_status = 'untracked'
             or current_status not in (${resolvedShipmentStatusesSql})
        ) = 0 as mature
    from cohort
    group by week_start
    order by week_start desc
    limit 18
  `);
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    const weekStart = String(row.week_start);
    const weekEconomics = economicsByWeek.get(weekStart);
    const adCostDzd = weekEconomics?.adCostDzd ?? 0;
    const operatingCostDzd = weekEconomics?.operatingCostDzd ?? 0;
    const profitsSuppressed = planningReturnRatePct === 100;
    const projectedTrueProfitDzd = profitsSuppressed
      ? 0
      : numeric(row.projected_contribution) - adCostDzd - operatingCostDzd;
    const deliveredTrueProfitDzd = profitsSuppressed
      ? 0
      : numeric(row.delivered_contribution) - adCostDzd - operatingCostDzd;
    const paidTrueProfitDzd = profitsSuppressed
      ? 0
      : numeric(row.paid_contribution) - adCostDzd - operatingCostDzd;
    const paid = numeric(row.paid);
    const returned = numeric(row.returned);
    const mature = Boolean(row.mature);
    return {
      weekStart,
      posted: numeric(row.posted),
      paid,
      returned,
      delivered: numeric(row.delivered),
      active: numeric(row.active),
      observedReturnRatePct: returnRate(returned, paid),
      projectedTrueProfitDzd,
      deliveredTrueProfitDzd,
      paidTrueProfitDzd,
      varianceDzd: mature ? paidTrueProfitDzd - projectedTrueProfitDzd : null,
      costCoveragePct: ratio(numeric(row.cost_complete_orders), numeric(row.posted)),
      mature,
    };
  });
}

async function loadFulfillmentData(
  db: Database,
  filters: Analytics2Filters,
  economics: EconomicsReport,
) {
  const [summary, trackedStates, attempts, trend, cohorts, cashPipeline, leadingForecast] =
    await Promise.all([
      loadFulfillmentSummary(db, filters.startDate, filters.endDate),
      loadFulfillmentStates(db, filters.startDate, filters.endDate),
      loadAttemptDistribution(
        db,
        filters.startDate,
        filters.endDate,
        Boolean((economics as EconomicsReport & { materializedFacts?: boolean }).materializedFacts),
      ),
      loadFulfillmentTrend(db, filters.startDate, filters.endDate),
      loadFulfillmentCohorts(db, filters.startDate, filters.endDate, economics),
      loadCashPipeline(db, filters),
      loadLeadingOrderForecast(db, filters, economics.settings),
    ]);
  const typedStates = trackedStates as FulfillmentStateRow[];
  const cohortSize =
    typedStates.reduce((sum, state) => sum + state.orders, 0) + summary.untrackedShipments;
  const states = typedStates.map((state) => ({
    ...state,
    sharePct: ratio(state.orders, cohortSize) ?? 0,
  }));
  if (summary.untrackedShipments > 0) {
    states.push({
      status: 'untracked',
      phase: 'untracked',
      orders: summary.untrackedShipments,
      sharePct: ratio(summary.untrackedShipments, cohortSize) ?? 0,
      staleOrders: 0,
      medianAgeHours: null,
      oldestActivityAt: null,
    });
  }
  return {
    summary,
    states,
    attempts,
    trend,
    cohorts,
    cashPipeline: withLeadingCashStages(cashPipeline, leadingForecast),
    leadingForecast,
  };
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
  attributionStartDate: string | null;
  projectedAdjustedProfitDzd: number;
  automaticPaidProfitDzd: number;
  profitCompleteOrders: number;
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
  | 'outcomeSpendCoveragePct'
  | 'projectedProfitX'
  | 'paidProfitX'
  | 'profitCoveragePct'
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
    attributedAdCostDzd: 0,
    projectedAdjustedProfitDzd: 0,
    automaticPaidProfitDzd: 0,
    profitCompleteOrders: 0,
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
    costPerPostedDzd: row.postedOrders > 0 ? row.attributedAdCostDzd / row.postedOrders : null,
    costPerConfirmedDzd:
      row.confirmedOrders > 0 ? row.attributedAdCostDzd / row.confirmedOrders : null,
    costPerDeliveredDzd:
      row.deliveredOrders > 0 ? row.attributedAdCostDzd / row.deliveredOrders : null,
    costPerPaidDzd: row.paidOrders > 0 ? row.attributedAdCostDzd / row.paidOrders : null,
    platformRoas: row.spendEur > 0 ? row.purchaseValue / row.spendEur : null,
    outcomeSpendCoveragePct: ratio(row.attributedAdCostDzd, row.adCostDzd),
    projectedProfitX:
      row.attributedAdCostDzd > 0 ? row.projectedAdjustedProfitDzd / row.attributedAdCostDzd : null,
    paidProfitX:
      row.attributedAdCostDzd > 0 && row.paidOrders > 0
        ? row.automaticPaidProfitDzd / row.attributedAdCostDzd
        : null,
    profitCoveragePct: ratio(row.profitCompleteOrders, row.postedOrders),
  };
}

function publicMetaEntity(row: Analytics2MetaEntity) {
  return {
    id: row.id,
    name: row.name,
    campaignName: row.campaignName,
    spendEur: row.spendEur,
    adCostDzd: row.adCostDzd,
    impressions: row.impressions,
    outboundClicks: row.outboundClicks,
    uniqueOutboundClicks: row.uniqueOutboundClicks,
    landingPageViews: row.landingPageViews,
    metaPurchases: row.metaPurchases,
    videoPlays: row.videoPlays,
    videoAverageWatchSeconds: row.videoAverageWatchSeconds,
    qualityRanking: row.qualityRanking,
    engagementRateRanking: row.engagementRateRanking,
    conversionRateRanking: row.conversionRateRanking,
    bricOrders: row.bricOrders,
    confirmedOrders: row.confirmedOrders,
    postedOrders: row.postedOrders,
    deliveredOrders: row.deliveredOrders,
    paidOrders: row.paidOrders,
    returnedOrders: row.returnedOrders,
    outboundCtrPct: row.outboundCtrPct,
    landingViewRatePct: row.landingViewRatePct,
    videoCompletionRatePct: row.videoCompletionRatePct,
    costPerPostedDzd: row.costPerPostedDzd,
    costPerDeliveredDzd: row.costPerDeliveredDzd,
    costPerPaidDzd: row.costPerPaidDzd,
    attributedAdCostDzd: row.attributedAdCostDzd,
    outcomeSpendCoveragePct: row.outcomeSpendCoveragePct,
    projectedProfitX: row.projectedProfitX,
    paidProfitX: row.paidProfitX,
    profitCoveragePct: row.profitCoveragePct,
  };
}

function groupMetaEntities(
  level: Analytics2EntityLevel,
  daily: MetaDailyRow[],
  outcomes: MetaOutcomeRow[],
) {
  const rows = new Map<string, MetaEntityAccumulator>();
  const namesByAdId = new Map(daily.map((row) => [row.adId, row]));
  const dailyByAdId = new Map<string, MetaDailyRow[]>();
  for (const row of daily) {
    const adRows = dailyByAdId.get(row.adId) ?? [];
    adRows.push(row);
    dailyByAdId.set(row.adId, adRows);
  }

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
    current.attributedAdCostDzd += (dailyByAdId.get(outcome.adId) ?? [])
      .filter((day) => !outcome.attributionStartDate || day.day >= outcome.attributionStartDate)
      .reduce((sum, day) => sum + day.adCostDzd, 0);
    current.projectedAdjustedProfitDzd += outcome.projectedAdjustedProfitDzd;
    current.automaticPaidProfitDzd += outcome.automaticPaidProfitDzd;
    current.profitCompleteOrders += outcome.profitCompleteOrders;
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
    .map((row) => ({ day: row.day, id: row.id, name: row.name, adCostDzd: row.adCostDzd }))
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
  const useMaterializedFacts = Boolean(
    (economics as EconomicsReport & { materializedFacts?: boolean }).materializedFacts,
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
    useMaterializedFacts
      ? db.execute(sql`
          select max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
            max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
            ${orderAcquisitionAttribution.metaAdId} as ad_id,
            count(*)::int as bric_orders,
            count(*) filter (where ${orders.confirmed} in (${confirmedStatuses}))::int
              as confirmed_orders,
            count(${analyticsOrderCohortFacts.orderId})::int as posted_orders,
            count(${analyticsOrderCohortFacts.deliveredAt})::int as delivered_orders,
            count(*) filter (
              where ${analyticsOrderCohortFacts.outcome} in ('paye_et_archive', 'payed')
            )::int as paid_orders,
            count(*) filter (
              where ${analyticsOrderCohortFacts.outcome} = 'retour_archive'
            )::int as returned_orders,
            min((${orderAcquisitionAttribution.capturedAt}
              at time zone 'Africa/Algiers')::date)::text as attribution_start_date,
            coalesce(sum(${stateAwareContributionSql({
              grossProfit: analyticsOrderCohortFacts.grossProfitDzd,
              currentStatus: analyticsOrderCohortFacts.outcome,
              deliveredAt: analyticsOrderCohortFacts.deliveredAt,
              planningReturnRatePct: sql`${economics.settings.defaultReturnRate}`,
            })}) filter (
              where ${analyticsOrderCohortFacts.grossProfitDzd} is not null
            ), 0)::double precision
              as projected_adjusted_profit,
            case when ${economics.settings.defaultReturnRate}::double precision = 100 then 0 else
              coalesce(sum(
                ${analyticsOrderCohortFacts.automaticPaidProfitDzd}::double precision
              ), 0)::double precision end as automatic_paid_profit,
            count(*) filter (where ${analyticsOrderCohortFacts.costComplete})::int
              as profit_complete_orders
          from ${orderAcquisitionAttribution}
          inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
          left join ${analyticsOrderCohortFacts}
            on ${analyticsOrderCohortFacts.orderId} = ${orders.id}
            and ${analyticsOrderCohortFacts.semanticsVersion}
              = ${ANALYTICS2_FACT_SEMANTICS_VERSION}
          where ${orderAcquisitionAttribution.channel} = 'meta_paid'
            and ${orderAcquisitionAttribution.metaAdId} is not null
            and ${timestampPredicate(
              orderAcquisitionAttribution.capturedAt,
              filters.startDate,
              filters.endDate,
            )}
          group by ${orderAcquisitionAttribution.metaAdId}
        `)
      : db.execute(sql`
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
      ), line_economics as (
        select ${orderLineItems.orderId} as order_id,
          bool_and(
            ${orderLineItems.unitPurchasePriceSnapshot} is not null
            and ${orderLineItems.lineTotal} is not null
          ) as cost_complete,
          sum(${orderLineItems.lineTotal})::double precision as product_revenue,
          sum(
            coalesce(
              ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
              ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
            )
          )::double precision as estimated_product_cost,
          sum(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
          )::double precision as exact_product_cost
        from ${orderLineItems}
        group by ${orderLineItems.orderId}
      )
      select max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
        max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
        ${orderAcquisitionAttribution.metaAdId} as ad_id,
        count(*)::int as bric_orders,
        count(*) filter (where ${orders.confirmed} in (${confirmedStatuses}))::int
          as confirmed_orders,
        count(first_posted.order_id)::int as posted_orders,
        count(delivered.order_id)::int as delivered_orders,
        count(*) filter (
          where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
        )::int
          as paid_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
          as returned_orders,
        min((${orderAcquisitionAttribution.capturedAt}
          at time zone 'Africa/Algiers')::date)::text as attribution_start_date,
        coalesce(sum(${stateAwareContributionSql({
          grossProfit: sql`line_economics.product_revenue
            - line_economics.estimated_product_cost`,
          currentStatus: ecotrackOrderStates.currentStatus,
          deliveredAt: sql`delivered.order_id`,
          planningReturnRatePct: sql`${economics.settings.defaultReturnRate}`,
        })}) filter (
          where first_posted.order_id is not null
            and line_economics.product_revenue is not null
        ), 0)::double precision as projected_adjusted_profit,
        case when ${economics.settings.defaultReturnRate}::double precision = 100 then 0 else
          coalesce(sum(
          coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          )
          - coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          )
          - case when line_economics.cost_complete then line_economics.exact_product_cost
          else coalesce(
            line_economics.product_revenue
              * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE},
            coalesce(
              ${ecotrackOrderStates.currentAmount}::double precision,
              ${orders.totalAmount}::double precision
            ) * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          ) end
          ) filter (
          where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
            and coalesce(
              ${ecotrackOrderStates.deliveryTariff},
              ${ecotrackOrderStates.estimatedFee}
            ) is not null
          ), 0)::double precision end as automatic_paid_profit,
        count(*) filter (
          where first_posted.order_id is not null and line_economics.cost_complete
        )::int as profit_complete_orders
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      left join first_posted on first_posted.order_id = ${orders.id}
      left join delivered on delivered.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join line_economics on line_economics.order_id = ${orders.id}
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
      attributionStartDate: row.attribution_start_date ? String(row.attribution_start_date) : null,
      projectedAdjustedProfitDzd: numeric(row.projected_adjusted_profit),
      automaticPaidProfitDzd: numeric(row.automatic_paid_profit),
      profitCompleteOrders: numeric(row.profit_complete_orders),
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
    entities: {
      campaigns: campaigns.slice(0, 100),
      adsets: adsets.slice(0, 100),
      ads: ads.slice(0, 100),
    },
    daily: {
      campaigns: buildMetaDailyByLevel('campaign', daily, campaigns),
      adsets: buildMetaDailyByLevel('adset', daily, adsets),
      ads: buildMetaDailyByLevel('ad', daily, ads),
    },
    summaryDaily: aggregateMetaDaily(daily),
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
          (${orders.createdAt} at time zone 'Africa/Algiers')::date as ordered_day,
          paid.paid_at::date as paid_day,
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
        count(*) filter (where ordered_day <= ${filters.endDate}::date)::int as eligible_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date
            and paid_day - ordered_day between 0 and 0
        )::int as paid_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
        )::int as eligible_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
            and paid_day - ordered_day between 0 and 3
        )::int as paid_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
        )::int as eligible_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
            and paid_day - ordered_day between 0 and 7
        )::int as paid_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
        )::int as eligible_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
            and paid_day - ordered_day between 0 and 14
        )::int as paid_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
        )::int as eligible_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and paid_day - ordered_day between 0 and 21
        )::int as paid_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and outcome in ('paye_et_archive', 'retour_archive')
        )::int as terminal
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
          { day: 0, paidRatePct: ratio(numeric(row.paid_d0), numeric(row.eligible_d0)) },
          { day: 3, paidRatePct: ratio(numeric(row.paid_d3), numeric(row.eligible_d3)) },
          { day: 7, paidRatePct: ratio(numeric(row.paid_d7), numeric(row.eligible_d7)) },
          { day: 14, paidRatePct: ratio(numeric(row.paid_d14), numeric(row.eligible_d14)) },
          { day: 21, paidRatePct: ratio(numeric(row.paid_d21), numeric(row.eligible_d21)) },
        ],
        maturityPct: ratio(numeric(row.terminal), numeric(row.eligible_d21)),
      };
    }),
  };
}

export function freshnessState(
  throughDate: string | null,
  endDate: string,
): Analytics2Source['state'] {
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
    )
    select
      (select count(*)::int from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as order_records,
      (select max((${orders.createdAt} at time zone 'Africa/Algiers')::date) from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as orders_through_date,
      (select max(${orders.updatedAt}) from ${orders}) as orders_updated_at,
      (select count(*)::int from posted) as posted_records,
      (select count(tracked_order_id)::int from posted) as ecotrack_records,
      (select max(${ecotrackOrderStates.updatedAt}) from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null) as ecotrack_updated_at,
      (select max((coalesce(
          ${ecotrackOrderStates.lastOrderSyncedAt},
          ${ecotrackOrderStates.lastStatusSyncedAt},
          ${ecotrackOrderStates.updatedAt}
        ) at time zone 'Africa/Algiers')::date)
        from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null) as ecotrack_through_date,
      (select count(distinct ${metaAdsDailyInsights.day})::int from ${metaAdsDailyInsights}
        where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)})
        as meta_days,
      (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}
        where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)})
        as meta_through_date,
      (select max(${metaAdsDailyInsights.syncedAt}) from ${metaAdsDailyInsights})
        as meta_updated_at,
      0::int as storefront_records,
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
      ) as storefront_updated_at
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const postedRecords = numeric(row.posted_records);
  const metaDays = numeric(row.meta_days);
  const expectedDays = filters.startDate ? inclusiveDays(filters.startDate, filters.endDate) : null;
  const metaThrough = row.meta_through_date ? String(row.meta_through_date) : null;
  const storefrontThrough = row.storefront_through_date
    ? String(row.storefront_through_date)
    : null;
  const ordersThrough = row.orders_through_date ? String(row.orders_through_date) : null;
  const ecotrackThrough = row.ecotrack_through_date ? String(row.ecotrack_through_date) : null;
  return [
    {
      key: 'orders',
      state: freshnessState(ordersThrough, filters.endDate),
      updatedAt: isoValue(row.orders_updated_at),
      throughDate: ordersThrough,
      records: numeric(row.order_records),
      coveragePct: 100,
    },
    {
      key: 'ecotrack',
      state: freshnessState(ecotrackThrough, filters.endDate),
      updatedAt: isoValue(row.ecotrack_updated_at),
      throughDate: ecotrackThrough,
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
      coveragePct: null,
    },
  ];
}

export function storefrontPathCoverage(filters: Analytics2Filters, now = new Date()) {
  const retainedFrom = addDays(dayInTimezone(now), -6);
  const coverageStartDate =
    filters.startDate && filters.startDate > retainedFrom ? filters.startDate : retainedFrom;
  const coverageEndDate = filters.endDate;
  return {
    coverageStartDate,
    coverageEndDate,
    coverageIsPartial: !filters.startDate || coverageStartDate > filters.startDate,
  };
}

async function loadStorefrontPaths(db: Database, filters: Analytics2Filters, now = new Date()) {
  const coverage = storefrontPathCoverage(filters, now);
  const { coverageStartDate, coverageEndDate } = coverage;
  if (coverageStartDate > coverageEndDate) {
    return { ...coverage, coverageIsPartial: true, rows: [] };
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
    ...coverage,
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

async function loadStorefrontOrderConversion(db: Database, filters: Analytics2Filters) {
  const [sessions, result] = await Promise.all([
    getCanonicalStorefrontSessionCount(statsInput(filters.startDate, filters.endDate)),
    db.execute(sql`
      select (select count(*)::int from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as submitted_orders
    `),
  ]);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const submittedOrders = numeric(row.submitted_orders);
  return {
    sessions,
    submittedOrders,
    conversionRatePct: ratio(submittedOrders, sessions),
  };
}

async function loadStorefrontSessionFunnel(db: Database, startDate: string, endDate: string) {
  const result = await db.execute(sql`
    with session_stages as (
      select ${analyticsEvents.sessionId} as session_id,
        bool_or(${analyticsEvents.eventName} = 'page_view') as visited,
        bool_or(${analyticsEvents.eventName} = 'view_item') as viewed_product,
        bool_or(${analyticsEvents.eventName} = 'add_to_cart') as added_to_cart,
        bool_or(${analyticsEvents.eventName} = 'begin_checkout') as began_checkout
      from ${analyticsEvents}
      where ${timestampPredicate(analyticsEvents.occurredAt, startDate, endDate)}
      group by ${analyticsEvents.sessionId}
    ), submitted_sessions as (
      select distinct ${orders.sessionId} as session_id
      from ${orders}
      where ${orders.sessionId} is not null
        and ${timestampPredicate(orders.createdAt, startDate, endDate)}
    )
    select count(*) filter (where visited)::int as sessions,
      count(*) filter (where visited and viewed_product)::int as product_sessions,
      count(*) filter (where visited and viewed_product and added_to_cart)::int as cart_sessions,
      count(*) filter (
        where visited and viewed_product and added_to_cart and began_checkout
      )::int as checkout_sessions,
      count(*) filter (
        where visited and viewed_product and added_to_cart and began_checkout
          and submitted_sessions.session_id is not null
      )::int as submitted_sessions
    from session_stages
    left join submitted_sessions using (session_id)
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return [
    { name: 'Sessions', value: numeric(row.sessions) },
    { name: 'Product-view sessions', value: numeric(row.product_sessions) },
    { name: 'Cart sessions', value: numeric(row.cart_sessions) },
    { name: 'Checkout sessions', value: numeric(row.checkout_sessions) },
    { name: 'Submitted-order sessions', value: numeric(row.submitted_sessions) },
  ].filter((stage) => stage.value > 0);
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
  const effectiveStatus = effectiveEcotrackStatusSql({
    localStatus: orders.confirmed,
    providerStatus: ecotrackOrderStates.currentStatus,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
      first_posted.posted_at at time zone 'Africa/Algiers'
    )`,
    referenceAt: sql`${filters.endDate}::date + interval '1 day'`,
  });
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        ${orderStatusHistory.changedAt} as posted_at,
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
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'payed') as paid_at,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
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
        where ${effectiveStatus} in ('paye_et_archive', 'payed')
      )::int as paid_orders,
      coalesce(sum(${orderLineItems.quantity}) filter (
        where ${effectiveStatus} in ('paye_et_archive', 'payed')
      ), 0)::int as paid_units,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${effectiveStatus} = 'retour_archive'
      )::int as returned_orders,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${effectiveStatus} <> 'untracked'
          and ${effectiveStatus} not in (${resolvedShipmentStatusesSql})
      )::int as active_orders,
      count(distinct ${orderLineItems.orderId}) filter (
        where ${orderLineItems.unitPurchasePriceSnapshot} is not null
      )::int as cost_complete_orders,
      sum(${stateAwareContributionSql({
        grossProfit: sql`${orderLineItems.lineTotal} - coalesce(
          ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
          ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
        )`,
        currentStatus: effectiveStatus,
        deliveredAt: sql`lifecycle.delivered_at`,
        planningReturnRatePct: sql`coalesce(
          ${profitTrackerDays.returnRatePct}::double precision,
          ${planningReturnRatePct}::double precision
        )`,
      })}) filter (
        where ${orderLineItems.lineTotal} is not null
      )::double precision as projected_contribution,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_at)) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.paid_at - first_posted.posted_at)) / 3600
      ) filter (where lifecycle.paid_at is not null)::double precision
        as payment_median_hours,
      count(distinct ${orderLineItems.orderId}) filter (
        where lifecycle.delivered_at is not null
      )::int as delivery_samples
    from first_posted
    inner join ${orders} on ${orders.id} = first_posted.order_id
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
    limit 100
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
        where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
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
  untrackedOrders: number;
  activeOrders: number;
  pipelineCodDzd: number;
  providerAmountCoveragePct: number | null;
  providerAmountValueCoveragePct: number | null;
  terminalPaidRatePct: number | null;
  deliveryMedianHours: number | null;
  deliverySamples: number;
  averageAttempts: number | null;
};

async function loadOperationalGeography(
  db: Database,
  filters: Analytics2Filters,
): Promise<OperationalGeographyRow[]> {
  const effectiveStatus = effectiveEcotrackStatusSql({
    localStatus: orders.confirmed,
    providerStatus: ecotrackOrderStates.currentStatus,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
      first_posted.posted_at at time zone 'Africa/Algiers'
    )`,
    referenceAt: sql`${filters.endDate}::date + interval '1 day'`,
  });
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        ${orderStatusHistory.changedAt} as posted_at,
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
        )::int as attempt_count,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    )
    select ${orders.state} as wilaya_id,
      coalesce(${ecotrackWilayas.name}, 'Unknown') as wilaya_name,
      count(*)::int as posted_orders,
      count(*) filter (
        where ${effectiveStatus} in ('paye_et_archive', 'payed')
      )::int
        as paid_orders,
      count(*) filter (where ${effectiveStatus} = 'retour_archive')::int
        as returned_orders,
      count(*) filter (where ${ecotrackOrderStates.orderId} is null)::int as untracked_orders,
      count(*) filter (
        where ${effectiveStatus} <> 'untracked'
          and ${effectiveStatus} not in (${resolvedShipmentStatusesSql})
      )::int as active_orders,
      coalesce(sum(coalesce(
        ${ecotrackOrderStates.currentAmount}::double precision,
        ${orders.totalAmount}::double precision
      )) filter (
        where ${effectiveStatus} <> 'untracked'
          and ${effectiveStatus} not in (${resolvedShipmentStatusesSql})
      ), 0)::double precision as pipeline_cod,
      count(*) filter (
        where ${effectiveStatus} <> 'untracked'
          and ${effectiveStatus} not in (${resolvedShipmentStatusesSql})
          and ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
      )::int as provider_amount_orders,
      coalesce(sum(${ecotrackOrderStates.currentAmount}::double precision) filter (
        where ${effectiveStatus} <> 'untracked'
          and ${effectiveStatus} not in (${resolvedShipmentStatusesSql})
          and ${ecotrackOrderStates.currentAmountSource} = 'ecotrack_orders'
      ), 0)::double precision as provider_amount_cod,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_at)) / 3600
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
    const activeOrders = numeric(row.active_orders);
    const pipelineCodDzd = numeric(row.pipeline_cod);
    return {
      wilayaId: row.wilaya_id == null ? null : numeric(row.wilaya_id),
      name: String(row.wilaya_name),
      postedOrders,
      paidOrders,
      returnedOrders,
      untrackedOrders: numeric(row.untracked_orders),
      activeOrders,
      pipelineCodDzd,
      providerAmountCoveragePct: ratio(numeric(row.provider_amount_orders), activeOrders),
      providerAmountValueCoveragePct: ratio(numeric(row.provider_amount_cod), pipelineCodDzd),
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
        ${orderStatusHistory.changedAt} as posted_at,
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
      count(*) filter (
        where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
      )::int
        as paid_orders,
      count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
        as returned_orders,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - first_posted.posted_at)) / 3600
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
    limit 40
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
  profitsSuppressed = false,
) {
  const result = await db.execute(sql`
    with line_economics as (
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
        case when ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
          then coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          )
        end as paid_value,
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
        case when ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
          and coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) is not null
          and coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) is not null
        then case when ${profitsSuppressed} then 0 else coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          ) - coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          ) - case when line_economics.cost_complete then line_economics.product_cost
          else coalesce(
            line_economics.product_revenue
              * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE},
            coalesce(
              ${ecotrackOrderStates.currentAmount}::double precision,
              ${orders.totalAmount}::double precision
            ) * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          ) end
        end end as paid_contribution,
        case when ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
          and not coalesce(line_economics.cost_complete, false)
        then 1 else 0 end as paid_contribution_uses_fallback,
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
        coalesce(sum(paid_value), 0)::double precision as paid_value,
        min(ordered_at) as first_order_at,
        min(ordered_at) filter (where order_number = 2) as second_order_at,
        max(ordered_at) as last_order_at,
        avg(extract(epoch from (ordered_at - previous_order_at)) / 86400)
          filter (where previous_order_at is not null)::double precision as reorder_days,
        coalesce(sum(paid_contribution), 0)::double precision as contribution_ltv,
        count(paid_contribution)::int as paid_orders,
        coalesce(sum(paid_contribution_uses_fallback), 0)::int as fallback_margin_orders,
        max(acquisition_cost)::double precision as acquisition_cost
      from with_acquisition
      group by customer_key
    ), summary as (
      select count(*)::int as all_customers,
        count(*) filter (where orders >= 2)::int as repeat_customers,
        coalesce(sum(orders), 0)::int as all_orders,
        coalesce(sum(total_value), 0)::double precision as all_value,
        percentile_cont(0.5) within group (order by reorder_days)
          filter (where reorder_days is not null)::double precision as median_reorder_days,
        avg(contribution_ltv)::double precision as average_contribution_ltv,
        count(*) filter (where acquisition_cost is not null)::int as attributed_customers,
        count(*) filter (
          where acquisition_cost > 0 and contribution_ltv / acquisition_cost >= 1
        )::int as paid_back_customers,
        count(*) filter (
          where first_order_at <= (${filters.endDate}::date - interval '30 days')
        )::int as second_order_eligible_customers,
        count(*) filter (
          where first_order_at <= (${filters.endDate}::date - interval '30 days')
            and second_order_at <= first_order_at + interval '30 days'
        )::int as second_order_converted_customers
      from customer_rollup
    )
    select customer_rollup.*,
      case when acquisition_cost > 0 then contribution_ltv / acquisition_cost end
        as acquisition_payback_ratio
      , summary.*
    from customer_rollup
    cross join summary
    order by orders desc, total_value desc
    limit 50
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
      paidValueDzd: numeric(row.paid_value),
      paidContributionMarginPct: ratio(numeric(row.contribution_ltv), numeric(row.paid_value)),
      fallbackMarginOrders: numeric(row.fallback_margin_orders),
      acquisitionCostDzd: nullableNumeric(row.acquisition_cost),
      acquisitionPaybackRatio: nullableNumeric(row.acquisition_payback_ratio),
    };
  });
  const summaryRow = (result.rows[0] ?? {}) as Record<string, unknown>;
  const customers = numeric(summaryRow.all_customers);
  const repeatCustomers = numeric(summaryRow.repeat_customers);
  const eligibleCustomers = numeric(summaryRow.second_order_eligible_customers);
  const convertedCustomers = numeric(summaryRow.second_order_converted_customers);
  const attributedCustomers = numeric(summaryRow.attributed_customers);
  return {
    summary: {
      customers,
      repeatCustomers,
      repeatRate: ratio(repeatCustomers, customers),
      secondOrderConversionPct: ratio(convertedCustomers, eligibleCustomers),
      secondOrderEligibleCustomers: eligibleCustomers,
      secondOrderConvertedCustomers: convertedCustomers,
      secondOrderWindowDays: 30,
      averageOrders: customers > 0 ? numeric(summaryRow.all_orders) / customers : 0,
      averageOrderValue:
        numeric(summaryRow.all_orders) > 0
          ? numeric(summaryRow.all_value) / numeric(summaryRow.all_orders)
          : 0,
      medianReorderIntervalDays: nullableNumeric(summaryRow.median_reorder_days),
      averageContributionLtvDzd: nullableNumeric(summaryRow.average_contribution_ltv),
      acquisitionPaybackPct: ratio(numeric(summaryRow.paid_back_customers), attributedCustomers),
      acquisitionCoveragePct: ratio(attributedCustomers, customers),
    },
    rows,
  };
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
    input.semanticsVersions.every((version) => version === ANALYTICS2_FACT_SEMANTICS_VERSION) &&
    input.oldestRefresh &&
    (!input.dependenciesUpdatedAt || input.oldestRefresh >= input.dependenciesUpdatedAt) &&
    !input.unresolvedFridayRollforward,
  );
}

async function loadMaterializedEconomicsReport(
  db: Database,
  filters: Analytics2Filters,
): Promise<EconomicsReport | null> {
  const factWhere = datePredicate(
    analyticsEconomicsDailyFacts.day,
    filters.startDate,
    filters.endDate,
  );
  const [factResult, dependencyResult, settings, costs] = await Promise.all([
    db.execute(sql`
      select ${analyticsEconomicsDailyFacts.day}::text as day,
        ${analyticsEconomicsDailyFacts.postedOrders} as posted_orders,
        ${analyticsEconomicsDailyFacts.paidOrders} as paid_orders,
        ${analyticsEconomicsDailyFacts.costCompleteOrders} as cost_complete_orders,
        ${analyticsEconomicsDailyFacts.paidProfitCompleteOrders} as paid_complete_orders,
        ${analyticsEconomicsDailyFacts.grossProfitDzd}::double precision as gross_profit,
        ${analyticsEconomicsDailyFacts.adjustedProfitDzd}::double precision as adjusted_profit,
        ${analyticsEconomicsDailyFacts.adCostDzd}::double precision as ad_cost,
        ${analyticsEconomicsDailyFacts.operatingCostDzd}::double precision as operating_cost,
        ${analyticsEconomicsDailyFacts.netProfitDzd}::double precision as net_profit,
        ${analyticsEconomicsDailyFacts.trueProfitDzd}::double precision as true_profit,
        ${analyticsEconomicsDailyFacts.automaticPaidCodDzd}::double precision as paid_cod,
        ${analyticsEconomicsDailyFacts.automaticPaidFeesDzd}::double precision as paid_fees,
        ${analyticsEconomicsDailyFacts.automaticPaidProfitDzd}::double precision as paid_profit,
        ${analyticsEconomicsDailyFacts.fxRateUsed}::double precision as fx_rate,
        ${analyticsEconomicsDailyFacts.planningReturnRatePct}::double precision as return_rate,
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
        where ${orderStatusHistory.status} = 11
        order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
      ), requested_cohort as (
        select order_id from first_posted
        where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
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
          where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)}),
        (select max(${profitTrackerDays.updatedAt}) from ${profitTrackerDays}
          where ${datePredicate(profitTrackerDays.day, filters.startDate, filters.endDate)}),
        (select max(${profitTrackerOperatingCosts.updatedAt})
          from ${profitTrackerOperatingCosts}),
        (select max(${profitTrackerSettings.updatedAt}) from ${profitTrackerSettings})
      ) as dependencies_updated_at,
      to_char(least(
        (select min((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
          from ${orderStatusHistory} where ${orderStatusHistory.status} = 11),
        (select min(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}),
        (select min(${profitTrackerDays.day}) from ${profitTrackerDays})
      ), 'YYYY-MM-DD') as required_start_date
    `),
    getProfitTrackerSettings(db),
    listProfitTrackerCosts(db),
  ]);
  const rows = factResult.rows as Array<Record<string, unknown>>;
  if (!rows.length) return null;
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
  const latestRow = rows.at(-1);
  const unresolvedFridayRollforward = Boolean(
    settings.restFrom &&
    filters.endDate >= settings.restFrom &&
    new Date(`${filters.endDate}T00:00:00.000Z`).getUTCDay() === 5 &&
    numeric(latestRow?.posted_orders) === 0 &&
    latestRow?.gross_profit == null &&
    numeric(latestRow?.ad_cost) > 0,
  );
  const factsAreUsable = materializedFactsAreUsable({
    requestedStartDate: requiredStartDate,
    requestedEndDate: filters.endDate,
    earliestFactDay: earliestFactDay || null,
    latestFactDay: latestFactDay || null,
    hasCompleteDateSpine,
    semanticsVersions: rows.map((row) => numeric(row.semantics_version)),
    oldestRefresh: oldestRefresh ?? null,
    dependenciesUpdatedAt: dependencyUpdatedAt,
    unresolvedFridayRollforward,
  });
  if (!factsAreUsable) return null;

  let cumulativeNetDzd = 0;
  let cumulativeNetBeforeReturnsDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  const ascendingDays = rows.map((row) => {
    const date = String(row.day);
    const grossProfitDzd = nullableNumeric(row.gross_profit);
    const adjustedProfitDzd = nullableNumeric(row.adjusted_profit);
    const adCostDzd = nullableNumeric(row.ad_cost);
    const netProfitDzd = nullableNumeric(row.net_profit);
    const trueProfitDzd = nullableNumeric(row.true_profit);
    const fxRateUsed = numeric(row.fx_rate) || settings.fxRate;
    const postedOrders = numeric(row.posted_orders);
    const costCompleteOrders = numeric(row.cost_complete_orders);
    const isRestDay = Boolean(
      settings.restFrom &&
      date >= settings.restFrom &&
      new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5 &&
      postedOrders === 0 &&
      grossProfitDzd == null,
    );
    cumulativeNetDzd += netProfitDzd ?? 0;
    cumulativeNetBeforeReturnsDzd +=
      grossProfitDzd != null && adCostDzd != null ? grossProfitDzd - adCostDzd : 0;
    cumulativeTrueProfitDzd += trueProfitDzd ?? 0;
    return {
      date,
      spendEur: adCostDzd == null ? null : adCostDzd / fxRateUsed,
      impressions: null,
      fbPurchases: null,
      cpm: null,
      ctr: null,
      linkClicks: null,
      landingPageViews: null,
      grossProfitDzd,
      returnRatePct: nullableNumeric(row.return_rate),
      confirmedOrders: postedOrders,
      note: null,
      fxRateUsed,
      metaSyncedAt: oldestRefresh ?? null,
      grossProfitSource: grossProfitDzd == null ? 'missing' : 'automatic',
      returnRateSource: grossProfitDzd == null ? 'missing' : 'default',
      confirmedOrdersSource: 'automatic',
      postedOrders,
      costCompleteOrders,
      projectedCoveragePct: ratio(costCompleteOrders, postedOrders),
      metrics: {
        adCostDzd,
        adjustedProfitDzd,
        netProfitDzd,
        profitX:
          adjustedProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? adjustedProfitDzd / adCostDzd
            : null,
        netProfitBeforeReturnsDzd:
          grossProfitDzd != null && adCostDzd != null ? grossProfitDzd - adCostDzd : null,
        profitXBeforeReturns:
          grossProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? grossProfitDzd / adCostDzd
            : null,
        costPerConfirmedDzd:
          adCostDzd != null && postedOrders > 0 ? adCostDzd / postedOrders : null,
        confirmationRatePct: null,
        clickToPageRatePct: null,
      },
      isRestDay,
      rolledInDzd: 0,
      rolledOutDzd: 0,
      operatingCostDzd: numeric(row.operating_cost),
      trueProfitDzd,
      cumulativeNetDzd,
      cumulativeNetBeforeReturnsDzd,
      cumulativeTrueProfitDzd,
    };
  });
  const grossProfitDzd = ascendingDays.reduce((sum, day) => sum + (day.grossProfitDzd ?? 0), 0);
  const adjustedProfitDzd = ascendingDays.reduce(
    (sum, day) => sum + (day.metrics.adjustedProfitDzd ?? 0),
    0,
  );
  const ratioAdCostDzd = ascendingDays.reduce((sum, day) => sum + (day.metrics.adCostDzd ?? 0), 0);
  const operatingCostDzd = ascendingDays.reduce((sum, day) => sum + day.operatingCostDzd, 0);
  const postedOrders = ascendingDays.reduce((sum, day) => sum + day.postedOrders, 0);
  const costCompleteOrders = ascendingDays.reduce((sum, day) => sum + day.costCompleteOrders, 0);
  const profitsSuppressed = settings.defaultReturnRate === 100;
  const netProfitDzd = profitsSuppressed ? 0 : adjustedProfitDzd - ratioAdCostDzd;
  const weekGroups = new Map<
    string,
    {
      weekStart: string;
      trackedDays: number;
      spendEur: number;
      adCostDzd: number;
      adjustedProfitDzd: number;
      operatingCostDzd: number;
    }
  >();
  for (const day of ascendingDays) {
    const weekStart = fridayWeekStart(day.date);
    const current = weekGroups.get(weekStart) ?? {
      weekStart,
      trackedDays: 0,
      spendEur: 0,
      adCostDzd: 0,
      adjustedProfitDzd: 0,
      operatingCostDzd: 0,
    };
    current.trackedDays += 1;
    current.spendEur += day.spendEur ?? 0;
    current.adCostDzd += day.metrics.adCostDzd ?? 0;
    current.adjustedProfitDzd += day.metrics.adjustedProfitDzd ?? 0;
    current.operatingCostDzd += day.operatingCostDzd;
    weekGroups.set(weekStart, current);
  }
  const weeks = [...weekGroups.values()]
    .map((week) => {
      const weekNetProfitDzd = profitsSuppressed ? 0 : week.adjustedProfitDzd - week.adCostDzd;
      return {
        ...week,
        netProfitDzd: weekNetProfitDzd,
        trueProfitDzd: profitsSuppressed ? 0 : weekNetProfitDzd - week.operatingCostDzd,
        profitX: profitsSuppressed
          ? 0
          : week.adCostDzd > 0
            ? week.adjustedProfitDzd / week.adCostDzd
            : null,
      };
    })
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
  const projectedCoveragePct = ratio(costCompleteOrders, postedOrders);
  return {
    materializedFacts: true,
    filters: {
      range: filters.range,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    settings,
    summary: {
      spendEur: ascendingDays.reduce((sum, day) => sum + (day.spendEur ?? 0), 0),
      impressions: 0,
      rawAdCostDzd: ratioAdCostDzd,
      ratioAdCostDzd,
      grossProfitDzd,
      adjustedProfitDzd,
      netProfitDzd,
      operatingCostDzd,
      trueProfitDzd: profitsSuppressed ? 0 : netProfitDzd - operatingCostDzd,
      profitX: profitsSuppressed
        ? 0
        : ratioAdCostDzd > 0
          ? adjustedProfitDzd / ratioAdCostDzd
          : null,
      profitXBeforeReturns: profitsSuppressed
        ? 0
        : ratioAdCostDzd > 0
          ? grossProfitDzd / ratioAdCostDzd
          : null,
      confirmedOrders: postedOrders,
      fbPurchases: 0,
      costPerConfirmedDzd: postedOrders > 0 ? ratioAdCostDzd / postedOrders : null,
      confirmationRatePct: null,
      clickToPageRatePct: null,
      postedOrders,
      costCompleteOrders,
      projectedCoveragePct,
    },
    days: [...ascendingDays].reverse(),
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
      metaDays: ascendingDays.length,
      pendingRollforwardDzd: 0,
    },
    warnings:
      projectedCoveragePct != null && projectedCoveragePct < 95
        ? [
            'Some posted orders use the 30% fallback product margin because purchase-cost snapshots are incomplete.',
          ]
        : [],
    freshness: {
      metaSyncedAt: oldestRefresh ?? null,
      settledReportThroughDate: null,
    },
  } as unknown as EconomicsReport;
}

async function loadEconomicsPair(
  db: Database,
  filters: Analytics2Filters,
  ...sourceStarts: Array<string | null>
) {
  const previousFiltersValue = previousFiltersWithCoverage(filters, ...sourceStarts);
  const previousInput = previousFiltersValue
    ? economicsInput(previousFiltersValue.startDate, previousFiltersValue.endDate)
    : null;
  const [current, previousReport] = await Promise.all([
    loadMaterializedEconomicsReport(db, filters).then(
      (report) =>
        report ??
        getProfitTrackerReport(economicsInput(filters.startDate, filters.endDate), { db }),
    ),
    previousInput && previousFiltersValue
      ? loadMaterializedEconomicsReport(db, previousFiltersValue).then(
          (report) => report ?? getProfitTrackerReport(previousInput, { db }),
        )
      : Promise.resolve<EconomicsReport | null>(null),
  ]);
  return { current, previous: previousReport };
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
    metric(
      'adCost',
      current.summary.rawAdCostDzd,
      previous?.summary.rawAdCostDzd ?? null,
      'dzd',
      'neutral',
    ),
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
      'down',
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

function previousFiltersWithCoverage(
  filters: Analytics2Filters,
  ...sourceStarts: Array<string | null>
): Analytics2Filters | null {
  const previous = previousFilters(filters);
  if (!previous || !previous.startDate || sourceStarts.some((date) => date == null)) return null;
  const coverageStart = [...(sourceStarts as string[])].sort().at(-1);
  return coverageStart && previous.startDate >= coverageStart ? previous : null;
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

async function loadCommandView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const economicsFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.meta),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.metaFrom),
  );
  const fulfillmentFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const storefrontFilters = clipAnalytics2Filters(
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
        metric(
          'paidOrders',
          fulfillment.paidOrders,
          previousFulfillment?.paidOrders ?? null,
          'number',
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
      trajectory: projectOpenEconomicsSeries(
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

async function loadMoneyView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const economicsFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.meta),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.metaFrom),
  );
  const fulfillmentFilters = clipAnalytics2Filters(
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
      series: projectOpenEconomicsSeries(
        aggregateEconomicsSeries(current, filters.resolvedGrain, economicsFilters.endDate),
        forecast,
        filters.resolvedGrain,
      ),
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

async function loadAcquisitionView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const performanceFilters = clipAnalytics2Filters(
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

async function loadFulfillmentView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const operationalFilters = clipAnalytics2Filters(
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

async function loadStorefrontView(
  db: Database,
  filters: Analytics2Filters,
  now: Date,
  cutoffs: Analytics2CanonicalCutoffs,
  includeDetails = false,
) {
  const storefrontFilters = clipAnalytics2Filters(
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
    getLiveStorefrontAnalytics(statsInput(storefrontFilters.startDate, storefrontFilters.endDate), {
      includeExperience: includeDetails,
    }),
    prior ? getLiveStorefrontAnalytics(prior, { includeExperience: false }) : Promise.resolve(null),
    loadSourceHealth(db, filters),
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

export type Analytics2StorefrontDetails = {
  metrics: Analytics2Metric[];
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
  filters: Analytics2Filters,
  paths: Awaited<ReturnType<typeof loadStorefrontPaths>>,
  funnel: Array<{ name: string; value: number }>,
): Analytics2StorefrontDetails {
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

export async function getAnalytics2StorefrontDetails(
  query: Analytics2Query,
  options: { db?: Database; now?: Date } = {},
) {
  const db = options.db ?? getDb();
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoffDate = reviewSetting ? await loadDatasetCutoffDate(db) : null;
  const clock = resolveAnalytics2ReferenceNow(reviewSetting, cutoffDate, wallNow);
  const effectiveQuery = clock.reviewClock
    ? clampQueryToReference({ ...query, view: 'storefront' }, clock.referenceDate)
    : { ...query, view: 'storefront' as const };
  const filters = resolveAnalytics2Filters(effectiveQuery, clock.now);
  const cutoffs = await loadCanonicalCutoffs(db);
  const storefrontFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const pathCoverage = storefrontPathCoverage(storefrontFilters, clock.now);
  const [dashboard, paths, funnel] = await Promise.all([
    getLiveStorefrontAnalytics(statsInput(storefrontFilters.startDate, storefrontFilters.endDate)),
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

async function loadCatalogOperationalSummary(db: Database, filters: Analytics2Filters) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = 11
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    )
    select coalesce(sum(${orderLineItems.quantity}), 0)::int as posted_units,
      coalesce(sum(${orderLineItems.quantity}) filter (
        where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
      ), 0)::int as paid_units
    from first_posted
    inner join ${orderLineItems} on ${orderLineItems.orderId} = first_posted.order_id
    left join ${ecotrackOrderStates}
      on ${ecotrackOrderStates.orderId} = first_posted.order_id
      and ${ecotrackOrderStates.deletedAt} is null
    where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return { postedUnits: numeric(row.posted_units), paidUnits: numeric(row.paid_units) };
}

async function loadCatalogView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const catalogFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.posted, cutoffs.ecotrack),
    commonCoverageStart(cutoffs.postedFrom, cutoffs.ecotrackFrom),
  );
  const storefrontFilters = clipAnalytics2Filters(
    filters,
    commonCutoff(cutoffs.orders, cutoffs.storefront),
    commonCoverageStart(cutoffs.ordersFrom, cutoffs.storefrontFrom),
  );
  const previousAnalytics = previousFiltersWithCoverage(
    catalogFilters,
    cutoffs.postedFrom,
    cutoffs.ecotrackFrom,
  );
  const { current: economics, previous: previousEconomics } = await loadEconomicsPair(
    db,
    catalogFilters,
    cutoffs.postedFrom,
  );
  const [
    websiteProducts,
    basketPairs,
    sources,
    operationalProducts,
    previousOperationalProducts,
    operationalGeography,
    operationalCommunes,
    productMetaAssociations,
    customerEconomics,
    previousCustomerEconomics,
    metaRegions,
    operationalSummary,
    previousOperationalSummary,
  ] = await Promise.all([
    getLiveWebsiteProductMetrics(
      statsInput(storefrontFilters.startDate, storefrontFilters.endDate),
    ),
    loadBasketPairs(db, catalogFilters),
    loadSourceHealth(db, filters, economics),
    loadOperationalProducts(db, catalogFilters, economics.settings.defaultReturnRate),
    previousAnalytics
      ? loadOperationalProducts(db, previousAnalytics, economics.settings.defaultReturnRate)
      : Promise.resolve([] as OperationalProductRow[]),
    loadOperationalGeography(db, catalogFilters),
    loadOperationalCommunes(db, catalogFilters),
    loadProductMetaAssociations(db, catalogFilters),
    loadCustomerEconomics(
      db,
      catalogFilters,
      economics.settings.fxRate,
      economics.settings.defaultReturnRate === 100,
    ),
    previousAnalytics
      ? loadCustomerEconomics(
          db,
          previousAnalytics,
          economics.settings.fxRate,
          economics.settings.defaultReturnRate === 100,
        )
      : Promise.resolve(null),
    loadMetaRegions(db, catalogFilters),
    loadCatalogOperationalSummary(db, catalogFilters),
    previousAnalytics
      ? loadCatalogOperationalSummary(db, previousAnalytics)
      : Promise.resolve(null),
  ]);
  const currentWebsiteProducts = websiteProducts as LiveWebsiteProductMetric[];
  const currentOperationalProducts = operationalProducts as OperationalProductRow[];
  const oldOperationalProducts = previousOperationalProducts as OperationalProductRow[];
  const websiteByProduct = new Map(currentWebsiteProducts.map((row) => [String(row.id), row]));
  const previousOperational = new Map<string, OperationalProductRow>(
    oldOperationalProducts.map((row) => [row.id, row]),
  );
  const metaByProduct = new Map<string, ProductMetaAssociation[]>();
  for (const association of productMetaAssociations) {
    const rows = metaByProduct.get(association.productId) ?? [];
    if (rows.length < 5) rows.push(association);
    metaByProduct.set(association.productId, rows);
  }
  const fallbackOperational: OperationalProductRow[] = currentWebsiteProducts.map((row) => ({
    id: String(row.id),
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
      const website = websiteByProduct.get(operational.id);
      const oldOperational = previousOperational.get(operational.id);
      return {
        id: operational.id,
        title: operational.title,
        sku: operational.sku ?? website?.sku ?? null,
        categoryName: operational.categoryName ?? website?.categoryName ?? null,
        brandName: operational.brandName ?? website?.brandName ?? null,
        postedOrders: operational.postedOrders,
        postedUnits: operational.postedUnits,
        paidOrders: operational.paidOrders,
        returnedOrders: operational.returnedOrders,
        activeOrders: operational.activeOrders,
        terminalPaidRatePct: operational.terminalPaidRatePct,
        costCoveragePct: operational.costCoveragePct,
        projectedContributionDzd: operational.projectedContributionDzd,
        deliveryMedianHours: operational.deliveryMedianHours,
        metaAssociations: metaByProduct.get(operational.id) ?? [],
        viewCount: website?.viewCount ?? 0,
        websiteConversionRate: website?.websiteConversionRate ?? 0,
        changes: {
          unitsPct: metricChange(operational.postedUnits, oldOperational?.postedUnits ?? null),
        },
      };
    });
  const geography = operationalGeography as OperationalGeographyRow[];
  return {
    data: {
      kind: 'catalog' as const,
      metrics: [
        metric(
          'postedUnits',
          operationalSummary.postedUnits,
          previousOperationalSummary?.postedUnits ?? null,
          'number',
        ),
        metric(
          'paidUnits',
          operationalSummary.paidUnits,
          previousOperationalSummary?.paidUnits ?? null,
          'number',
        ),
        metric(
          'adjustedProfit',
          economics.summary.adjustedProfitDzd,
          previousEconomics?.summary.adjustedProfitDzd ?? null,
          'dzd',
        ),
        metric(
          'customers',
          customerEconomics.summary.customers,
          previousCustomerEconomics?.summary.customers ?? null,
          'number',
        ),
        metric(
          'repeatRate',
          customerEconomics.summary.repeatRate,
          previousCustomerEconomics?.summary.repeatRate ?? null,
          'percent',
        ),
      ],
      products,
      coverage: economics.coverage,
      basketPairs,
      geography: {
        wilayas: geography,
        communes: operationalCommunes,
        metaRegions,
      },
      customers: customerEconomics,
    },
    effectiveRanges: [
      effectiveRange('catalog', catalogFilters, ['orders', 'ecotrack', 'assumptions']),
      effectiveRange('catalogStorefront', storefrontFilters, ['orders', 'storefront']),
    ],
    sources,
    warnings: [...sourceWarnings(sources)],
  };
}

function costIsActiveOn(cost: EconomicsReport['costs'][number], date: string) {
  return cost.startDate <= date && (!cost.endDate || cost.endDate >= date);
}

async function loadAssumptionsView(
  db: Database,
  filters: Analytics2Filters,
  cutoffs: Analytics2CanonicalCutoffs,
) {
  const economicsFilters = clipAnalytics2Filters(
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
  filters: Analytics2Filters,
  availableThroughDate: string | null,
): Analytics2Filters {
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

async function loadSearchView(db: Database, filters: Analytics2Filters) {
  const availableThroughDate = await loadSearchThroughDate(db, filters.endDate);
  const searchFilters = finalizeSearchFilters(filters, availableThroughDate);
  const search = await loadSearchAnalytics(db, searchFilters);
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
  effectiveRanges: Analytics2EffectiveRange[];
  sources: Analytics2Source[];
  warnings: LoadedAnalytics2Section['warnings'];
  diagnostics: {
    queryDurationMs: number;
    responseSizeBytes: number;
  };
};

export async function getAnalytics2Data(
  query: Analytics2Query,
  options: { db?: Database; now?: Date; includeStorefrontDetails?: boolean } = {},
): Promise<Analytics2Payload> {
  const startedAt = performance.now();
  const db = options.db ?? getDb();
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoffDate = reviewSetting ? await loadDatasetCutoffDate(db) : null;
  const clock = resolveAnalytics2ReferenceNow(reviewSetting, cutoffDate, wallNow);
  const now = clock.now;
  const effectiveQuery = clock.reviewClock
    ? clampQueryToReference(query, clock.referenceDate)
    : query;
  const filters = resolveAnalytics2Filters(effectiveQuery, now);
  const cutoffs = filters.view === 'search' ? null : await loadCanonicalCutoffs(db);
  let loaded: LoadedAnalytics2Section;

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
      ? loaded.sources.map((source: Analytics2Source) => ({
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
  } satisfies Analytics2Payload;
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
