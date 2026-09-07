import {
  ecotrackOrderStates,
  ecotrackOrderStatusObservations,
  ecotrackOrderTrackingEvents,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
import { ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE } from '../../analytics-fact-contract';
import type {
  AnalyticsAutomaticPaidDay,
  AnalyticsAutomaticPaidEconomics,
  AnalyticsFilters,
} from '../contract';
import { type Database, paidShipmentStatusesSql } from '../loaders-shared';
import { ratio } from '../metrics';
import { datePredicate, numeric } from '../query-values';

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
