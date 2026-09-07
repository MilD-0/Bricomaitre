import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import {
  CONFIRMED_LIFECYCLE_ORDER_STATUSES,
  ORDER_STATUS,
} from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
import { effectiveEcotrackStatusSql } from '../../ecotrack-status-policy';
import type { AnalyticsFilters } from '../contract';
import { addDays } from '../date-range';
import {
  type AnalyticsFulfillmentSummary,
  type AnalyticsReturnObservation,
  type Database,
  paidShipmentStatusesSql,
  resolvedShipmentStatusesSql,
} from '../loaders-shared';
import { ratio, returnRate } from '../metrics';
import { datePredicate, numeric, timestampPredicate } from '../query-values';

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
