import { sql } from 'drizzle-orm';

import {
  analyticsOrderCohortFacts,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderLineItems,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from '../analytics-fact-contract';
import { correctedEcotrackStatusSql, effectiveEcotrackStatusSql } from '../ecotrack-status-policy';
import { addDays } from './date-range';
import { isMaterializedEconomicsReport } from './economics-data';
import { ratio, returnRate } from './metrics';
import { datePredicate, isoValue, nullableNumeric, numeric } from './query-values';
import {
  type Database,
  type EconomicsReport,
  fulfillmentPhase,
  paidShipmentStatusesSql,
  resolvedShipmentStatusesSql,
  stateAwareContributionSql,
} from './loaders-shared';

export type FulfillmentStateRow = {
  status: string;
  phase: string;
  orders: number;
  sharePct: number;
  staleOrders: number;
  medianAgeHours: number | null;
  oldestActivityAt: string | null;
};

export async function loadFulfillmentStates(
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
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
        localStatus: orders.inHouseStatus,
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

export async function loadAttemptDistribution(
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
        and ${analyticsOrderCohortFacts.outcome} in (${paidShipmentStatusesSql}, 'retour_archive')
        and ${analyticsOrderCohortFacts.semanticsVersion}
          = ${ANALYTICS_FACT_SEMANTICS_VERSION}
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), attempts as (
      select first_posted.order_id,
        count(${ecotrackOrderTrackingEvents.id}) filter (
          where ${ecotrackOrderTrackingEvents.status} = 'attempt_delivery'
        )::int as attempts,
        ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} as outcome
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      inner join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join ${ecotrackOrderTrackingEvents}
        on ${ecotrackOrderTrackingEvents.orderId} = first_posted.order_id
      where ${datePredicate(sql`first_posted.posted_day`, startDate, endDate)}
        and ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in (${paidShipmentStatusesSql}, 'retour_archive')
      group by first_posted.order_id, ${ecotrackOrderStates.currentStatus}, ${orders.inHouseStatus}
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

export async function loadFulfillmentTrend(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
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

export async function loadFulfillmentCohorts(
  db: Database,
  startDate: string | null,
  endDate: string,
  economics: EconomicsReport,
) {
  const planningReturnRatePct = economics.settings.defaultReturnRate;
  const economicsByWeek = new Map(economics.weeks.map((week) => [week.weekStart, week]));
  const matureCutoffDate = addDays(endDate, -21);
  const effectiveCohortStatus = effectiveEcotrackStatusSql({
    localStatus: orders.inHouseStatus,
    providerStatus: ecotrackOrderStates.currentStatus,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
      first_posted.posted_at
    )`,
    referenceAt: sql`${endDate}::date + interval '1 day'`,
  });
  const result = isMaterializedEconomicsReport(economics)
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
          = ${ANALYTICS_FACT_SEMANTICS_VERSION}
    )
    select week_start::text,
      count(*)::int as posted,
      count(*) filter (where current_status in (${paidShipmentStatusesSql}))::int as paid,
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
          where current_status in (${paidShipmentStatusesSql})
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
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
      count(*) filter (where current_status in (${paidShipmentStatusesSql}))::int as paid,
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
          where current_status in (${paidShipmentStatusesSql})
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
