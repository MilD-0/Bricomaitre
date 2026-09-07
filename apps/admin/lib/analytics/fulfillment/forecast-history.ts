import {
  analyticsEconomicsDailyFacts,
  ecotrackOrderStates,
  orderLineItems,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import {
  CONFIRMED_LIFECYCLE_ORDER_STATUSES,
  ORDER_STATUS,
} from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from '../../analytics-fact-contract';
import { getProfitTrackerSettings } from '../../profit-tracker';
import type { AnalyticsFilters } from '../contract';
import { addDays, inclusiveDays } from '../date-range';
import { buildLeadingOrderForecast } from '../forecast';
import { type Database } from '../loaders-shared';
import { nullableNumeric, numeric, timestampPredicate } from '../query-values';

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
