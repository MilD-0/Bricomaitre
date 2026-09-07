import {
  ecotrackOrderStates,
  metaAdsDailyInsights,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  profitTrackerDays,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE } from '../../analytics-fact-contract';
import { correctedEcotrackStatusSql } from '../../ecotrack-status-policy';
import type { AnalyticsFilters } from '../contract';
import { type Database } from '../loaders-shared';
import { ratio } from '../metrics';
import {
  datePredicate,
  isoValue,
  nullableNumeric,
  numeric,
  timestampPredicate,
} from '../query-values';

export async function loadCustomerEconomics(
  db: Pick<Database, 'execute'>,
  filters: AnalyticsFilters,
  fallbackFxRate: number,
  profitsSuppressed = false,
) {
  const result = await db.execute(sql`
    with cohort_customers as materialized (
      select coalesce(
        nullif(${orders.normalizedPhone}, ''),
        regexp_replace(${orders.phoneNumber1}, '\\D', '', 'g')
      ) as customer_key
      from ${orders}
      where ${timestampPredicate(orders.createdAt, null, filters.endDate)}
      group by customer_key
      having ${filters.startDate ? sql`min((${orders.createdAt} at time zone 'Africa/Algiers')::date) >= ${filters.startDate}::date and` : sql``}
        min((${orders.createdAt} at time zone 'Africa/Algiers')::date) <= ${filters.endDate}::date
    ), selected_orders as materialized (
      select ${orders.id}, ${orders.normalizedPhone}, ${orders.phoneNumber1},
        ${orders.firstName}, ${orders.lastName}, ${orders.city}, ${orders.createdAt},
        ${orders.totalAmount}, ${orders.inHouseStatus}
      from ${orders}
      -- Cohort membership already proves there are no earlier orders for these
      -- customers. Bound this second scan as well, before joining line economics.
      where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
        ${
          filters.startDate
            ? sql`and exists (
          select 1 from cohort_customers where cohort_customers.customer_key = coalesce(
            nullif(${orders.normalizedPhone}, ''),
            regexp_replace(${orders.phoneNumber1}, '\\D', '', 'g')
          )
        )`
            : sql``
        }
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
      ${
        filters.startDate
          ? sql`where exists (
        select 1 from selected_orders where selected_orders.id = ${orderLineItems.orderId}
      )`
          : sql`inner join selected_orders on selected_orders.id = ${orderLineItems.orderId}`
      }
      group by ${orderLineItems.orderId}
    ), meta_spend as (
      select ${metaAdsDailyInsights.adId} as ad_id,
        ${metaAdsDailyInsights.day} as day,
        sum(${metaAdsDailyInsights.spend})::double precision as spend_eur
      from ${metaAdsDailyInsights}
      where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)}
      group by ${metaAdsDailyInsights.adId}, ${metaAdsDailyInsights.day}
    ), attributed_orders as (
      select ${orderAcquisitionAttribution.metaAdId} as ad_id,
        (${orders.createdAt} at time zone 'Africa/Algiers')::date as day,
        count(distinct ${orders.id})::int as orders
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
        and ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
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
        case when ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('paye_et_archive', 'payed')
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
        case when ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('paye_et_archive', 'payed')
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
        case when ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('paye_et_archive', 'payed')
          and not coalesce(line_economics.cost_complete, false)
        then 1 else 0 end as paid_contribution_uses_fallback,
        ${orderAcquisitionAttribution.metaAdId} as meta_ad_id
      from selected_orders as ${orders}
      left join line_economics on line_economics.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join ${orderAcquisitionAttribution}
        on ${orderAcquisitionAttribution.orderId} = ${orders.id}
        and ${orderAcquisitionAttribution.channel} = 'meta_paid'
      where (${orders.createdAt} at time zone 'Africa/Algiers')::date <= ${filters.endDate}::date
    ), with_acquisition as (
      select ordered.*,
        case when ordered.order_number = 1 and attributed_orders.orders > 0 then
          meta_spend.spend_eur
          * coalesce(${profitTrackerDays.fxRateUsed}::double precision, ${fallbackFxRate})
          / attributed_orders.orders
        end as acquisition_cost
      from ordered
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
