import { sql } from 'drizzle-orm';

import {
  analyticsEconomicsDailyFacts,
  ecotrackOrderStatusObservations,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
} from '@bric/db/schema';
import {
  CONFIRMED_LIFECYCLE_ORDER_STATUSES,
  ORDER_STATUS,
} from '@bric/storefront-core/order-domain';
import { getProfitTrackerSettings } from '../profit-tracker';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from '../analytics-fact-contract';
import { effectiveEcotrackStatusSql } from '../ecotrack-status-policy';
import type {
  AnalyticsAutomaticPaidDay,
  AnalyticsAutomaticPaidEconomics,
  AnalyticsCashStage,
  AnalyticsFilters,
  AnalyticsLeadingOrderForecast,
} from './contract';
import { addDays, inclusiveDays } from './date-range';
import { buildLeadingOrderForecast } from './forecast';
import { ratio, returnRate } from './metrics';
import { datePredicate, nullableNumeric, numeric, timestampPredicate } from './query-values';
import {
  type AnalyticsFulfillmentSummary,
  type AnalyticsReturnObservation,
  type Database,
  paidShipmentStatusesSql,
  resolvedShipmentStatusesSql,
} from './loaders-shared';

export async function loadFulfillmentSummary(
  db: Database,
  startDate: string | null,
  endDate: string,
  submissionRange = { startDate, endDate },
): Promise<
  AnalyticsFulfillmentSummary & {
    matureCutoffDate: string;
    submissionCohort: {
      submittedOrders: number;
      confirmedOrders: number;
      postedOrders: number;
      deliveredOrders: number;
      paidOrders: number;
    };
  }
> {
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), posted_cohort as (
      select first_posted.order_id,
        first_posted.posted_day,
        ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)} as in_posting_cohort,
        ${timestampPredicate(orders.createdAt, submissionRange.startDate, submissionRange.endDate)} as in_submission_cohort,
        ${effectiveEcotrackStatusSql({
          localStatus: orders.inHouseStatus,
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
      left join lateral (
        select
          min(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
              + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
          max(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
              + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as latest_activity_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.orderId} = first_posted.order_id
      ) lifecycle on true
      where (${datePredicate(sql`first_posted.posted_day`, startDate, endDate)})
        or (${timestampPredicate(orders.createdAt, submissionRange.startDate, submissionRange.endDate)})
    ), order_cohort as (
      select ${orders.id}, ${orders.inHouseStatus}
      from ${orders}
      where ${timestampPredicate(orders.createdAt, startDate, endDate)}
    )
    , submission_cohort as (
      select ${orders.id}, ${orders.inHouseStatus},
        exists (select 1 from ${orderStatusHistory}
          where ${orderStatusHistory.orderId} = ${orders.id}
            and ${orderStatusHistory.status} in (${confirmedStatuses})) as was_confirmed
      from ${orders}
      where ${timestampPredicate(orders.createdAt, submissionRange.startDate, submissionRange.endDate)}
    )
    select
      (select count(*)::int from submission_cohort) as funnel_submitted,
      (select count(*) filter (where was_confirmed or confirmed in (${confirmedStatuses}))::int from submission_cohort) as funnel_confirmed,
      (select count(*)::int from posted_cohort where in_submission_cohort) as funnel_posted,
      (select count(*)::int from posted_cohort where in_submission_cohort and
        (delivered_at is not null or current_status in (${paidShipmentStatusesSql}))) as funnel_delivered,
      (select count(*)::int from posted_cohort where in_submission_cohort and current_status in (${paidShipmentStatusesSql})) as funnel_paid,
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
      count(*) filter (where current_status in (${paidShipmentStatusesSql}))::int as paid_orders,
      count(*) filter (where current_status = 'retour_archive')::int as returned_orders,
      count(*) filter (where current_status = 'annule')::int as cancelled_orders,
      count(*) filter (where current_status in (${paidShipmentStatusesSql}, 'retour_archive'))::int
        as terminal_orders,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date
          and current_status in (${paidShipmentStatusesSql})
      )::int as mature_paid_orders,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date and current_status = 'retour_archive'
      )::int as mature_returned_orders
    from posted_cohort
    where in_posting_cohort
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const paidOrders = numeric(row.paid_orders);
  const returnedOrders = numeric(row.returned_orders);
  const maturePaid = numeric(row.mature_paid_orders);
  const matureReturned = numeric(row.mature_returned_orders);
  return {
    submissionCohort: {
      submittedOrders: numeric(row.funnel_submitted),
      confirmedOrders: numeric(row.funnel_confirmed),
      postedOrders: numeric(row.funnel_posted),
      deliveredOrders: numeric(row.funnel_delivered),
      paidOrders: numeric(row.funnel_paid),
    },
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

export async function loadReturnObservation(
  db: Database,
  filters: AnalyticsFilters,
  planningRatePct: number,
  fulfillmentSummary?: Awaited<ReturnType<typeof loadFulfillmentSummary>>,
): Promise<AnalyticsReturnObservation> {
  const summary =
    fulfillmentSummary ?? (await loadFulfillmentSummary(db, filters.startDate, filters.endDate));
  const matureCutoffDate = summary.matureCutoffDate;
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), cohort as (
      select first_posted.posted_day,
        ${effectiveEcotrackStatusSql({
          localStatus: orders.inHouseStatus,
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
      left join lateral (
        select
          max(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
              + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as latest_activity_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.orderId} = first_posted.order_id
      ) lifecycle on true
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    )
    select
      count(*) filter (where current_status in (${paidShipmentStatusesSql}))::int as paid,
      count(*) filter (where current_status = 'retour_archive')::int as returned,
      count(*) filter (
        where posted_day <= ${matureCutoffDate}::date
          and current_status in (${paidShipmentStatusesSql})
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
  filters: AnalyticsFilters,
  profitsSuppressed = false,
): Promise<AnalyticsAutomaticPaidEconomics> {
  const result = await db.execute(sql`
    with paid_events as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) at time zone 'Africa/Algiers' as paid_at
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.COMPLETED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
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
      left join lateral (
        select
          bool_and(
            ${orderLineItems.unitPurchasePriceSnapshot} is not null
            and ${orderLineItems.lineTotal} is not null
          ) as cost_complete,
          sum(${orderLineItems.lineTotal})::double precision as product_revenue,
          sum(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
          )::double precision as product_cost
        from ${orderLineItems}
        where ${orderLineItems.orderId} = ${ecotrackOrderStates.orderId}
      ) line_economics on true
      left join ${processedOrders}
        on ${processedOrders.tracking} = ${ecotrackOrderStates.trackingNumber}
      where ${ecotrackOrderStates.deletedAt} is null
        and ${ecotrackOrderStates.currentStatus} in (${paidShipmentStatusesSql})
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
  const days: AnalyticsAutomaticPaidDay[] = Array.from(
    result.rows as Iterable<unknown>,
    (raw): AnalyticsAutomaticPaidDay => {
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
    AnalyticsAutomaticPaidEconomics['summary'],
    'profitCoveragePct' | 'providerAmountCoveragePct'
  > & { providerAmountOrders: number };
  const summary = days.reduce<PaidAccumulator>(
    (current: PaidAccumulator, day: AnalyticsAutomaticPaidDay) => ({
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

async function loadPaidOutcomeForecastHistory(db: Database, asOfDate: string) {
  const startDate = addDays(asOfDate, -56);
  const endDate = addDays(asOfDate, -1);
  const result = await db.execute(sql`
    select ${analyticsEconomicsDailyFacts.day}::text as day,
      ${analyticsEconomicsDailyFacts.paidOrders} as paid_orders
    from ${analyticsEconomicsDailyFacts}
    where ${analyticsEconomicsDailyFacts.day} between ${startDate}::date and ${endDate}::date
      and ${analyticsEconomicsDailyFacts.semanticsVersion}
        = ${ANALYTICS_FACT_SEMANTICS_VERSION}
    order by ${analyticsEconomicsDailyFacts.day}
  `);
  if (result.rows.length !== inclusiveDays(startDate, endDate)) return null;
  return {
    startDate,
    days: result.rows.map((raw: unknown) => {
      const row = raw as Record<string, unknown>;
      return { date: String(row.day), paidOrders: numeric(row.paid_orders) };
    }),
  };
}

export async function loadLeadingOrderForecast(
  db: Database,
  filters: AnalyticsFilters,
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
  const [result, paidOutcomeHistory] = await Promise.all([
    db.execute(sql`
    with lifecycle as (
      select ${orderStatusHistory.orderId} as order_id,
        min(${orderStatusHistory.changedAt}) filter (
          where ${orderStatusHistory.status} in (${confirmedStatuses})
        ) as confirmed_at,
        min(${orderStatusHistory.changedAt}) filter (
          where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
        ) as posted_at
      from ${orderStatusHistory}
      inner join ${orders} on ${orders.id} = ${orderStatusHistory.orderId}
      where ${timestampPredicate(orders.createdAt, historicalStartDate, filters.endDate)}
        and ${orderStatusHistory.changedAt} < ${filters.endDate}::date + interval '1 day'
      group by ${orderStatusHistory.orderId}
    ), historical as (
      select ${orders.id} as order_id,
        ${orders.createdAt} as submitted_at,
        ${orders.inHouseStatus} as current_status,
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
          when ${orders.inHouseStatus} in (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.DELAYED}) then 'confirmed'
          when ${orders.inHouseStatus} in (${ORDER_STATUS.NOT_CONTACTED}, ${ORDER_STATUS.NO_ANSWER}) then 'submitted'
          else null
        end as stage,
        ${orders.totalAmount}::double precision as cod_dzd,
        coalesce(
          line_economics.gross_profit,
          ${orders.totalAmount}::double precision * ${ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
        ) as gross_profit_dzd
      from ${orders}
      left join lifecycle on lifecycle.order_id = ${orders.id}
      left join lateral (
        select
          sum(
            ${orderLineItems.lineTotal} - coalesce(
              ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
              ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
            )
          )::double precision as gross_profit
        from ${orderLineItems}
        where ${orderLineItems.orderId} = ${orders.id}
      ) line_economics on true
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      cross join timing
      where (${orders.createdAt} at time zone 'Africa/Algiers')::date
        between ${pendingStartDate}::date and ${filters.endDate}::date
        and lifecycle.posted_at is null
        and ${ecotrackOrderStates.orderId} is null
        and ${orders.inHouseStatus} in (${ORDER_STATUS.NOT_CONTACTED}, ${ORDER_STATUS.NO_ANSWER}, ${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.DELAYED})
        and (
          (${orders.inHouseStatus} in (${ORDER_STATUS.NOT_CONTACTED}, ${ORDER_STATUS.NO_ANSWER}) and ${orders.createdAt} >=
            ${filters.endDate}::date + interval '1 day'
              - greatest(
                  24,
                  least(168, coalesce(timing.p95_submitted_to_confirmed_hours, 72))
                ) * interval '1 hour')
          or
          (${orders.inHouseStatus} in (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.DELAYED}) and coalesce(
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
    `),
    loadPaidOutcomeForecastHistory(db, filters.endDate),
  ]);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return buildLeadingOrderForecast({
    asOfDate: filters.endDate,
    historicalStartDate,
    historicalEndDate,
    historicalSubmittedOrders: numeric(row.historical_submitted),
    historicalConfirmedOrders: numeric(row.historical_confirmed),
    historicalPostedOrders: numeric(row.historical_posted),
    paidOutcomeHistory: paidOutcomeHistory ?? undefined,
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

export async function loadCashPipeline(
  db: Database,
  filters: AnalyticsFilters,
): Promise<AnalyticsCashStage[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day,
        ${orderStatusHistory.changedAt} at time zone 'Africa/Algiers' as posted_at
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), effective as (
      select ${effectiveEcotrackStatusSql({
        localStatus: orders.inHouseStatus,
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
      left join lateral (
        select
          max(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
              + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as latest_activity_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.orderId} = first_posted.order_id
      ) lifecycle on true
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
  const order: AnalyticsCashStage['key'][] = [
    'inTransit',
    'deliveredAwaitingCollection',
    'collectedAwaitingPayout',
    'paymentReady',
  ];
  const rows = new Map<AnalyticsCashStage['key'], AnalyticsCashStage>();
  for (const raw of result.rows as Iterable<unknown>) {
    const row = raw as Record<string, unknown>;
    const ordersCount = numeric(row.orders);
    const key = String(row.stage) as AnalyticsCashStage['key'];
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

export function withLeadingCashStages(
  rows: AnalyticsCashStage[],
  leading: AnalyticsLeadingOrderForecast,
) {
  const leadingRows: AnalyticsCashStage[] = [
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
