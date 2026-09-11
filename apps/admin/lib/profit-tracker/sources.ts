import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  offPipelineSales,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { and, asc, desc, gte, lte, sql } from 'drizzle-orm';
import { ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE } from '../analytics-fact-contract';
import { isoValue as isoTimestamp, numeric } from '../analytics/query-values';
import { effectiveEcotrackStatusSql } from '../ecotrack-status-policy';
import { applyProfitTrackerRollforward } from '../profit-tracker-metrics';
import {
  ANALYTICS_TIMEZONE,
  type AutomaticDayEconomics,
  type Database,
  type MetaDayEconomics,
  type OrderCohortDayEconomics,
  type RealizedDayEconomics,
} from './contract';

export async function loadOrderCohortDayEconomics(
  db: Database,
  startDate: string | null,
  endDate: string,
  status: number,
) {
  const result = await db.execute(sql`
    with first_status as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone ${ANALYTICS_TIMEZONE})::date as day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${status}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), selected_status as materialized (
      select * from first_status
      where ${startDate ? sql`first_status.day >= ${startDate}::date` : sql`true`}
        and first_status.day <= ${endDate}::date
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
      inner join selected_status on selected_status.order_id = ${ecotrackOrderTrackingEvents.orderId}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        sum(
          ${orderLineItems.lineTotal}
          - coalesce(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
            ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          )
        )::double precision as gross_profit
      from ${orderLineItems}
      inner join selected_status on selected_status.order_id = ${orderLineItems.orderId}
      group by ${orderLineItems.orderId}
    ), classified as (
      select first_status.day,
        line_economics.cost_complete,
        line_economics.gross_profit,
        case
          when ${effectiveEcotrackStatusSql({
            localStatus: orders.inHouseStatus,
            providerStatus: ecotrackOrderStates.currentStatus,
            latestActivityAt: sql`lifecycle.latest_activity_at`,
            fallbackActivityAt: sql`coalesce(
              ${ecotrackOrderStates.providerCreatedAt} at time zone ${ANALYTICS_TIMEZONE},
              first_status.day::timestamp
            )`,
            referenceAt: sql`${endDate}::date + interval '1 day'`,
          })} in ('retour_archive', 'annule', 'failed') then 'lost'
          when ${effectiveEcotrackStatusSql({
            localStatus: orders.inHouseStatus,
            providerStatus: ecotrackOrderStates.currentStatus,
            latestActivityAt: sql`lifecycle.latest_activity_at`,
            fallbackActivityAt: sql`coalesce(
              ${ecotrackOrderStates.providerCreatedAt} at time zone ${ANALYTICS_TIMEZONE},
              first_status.day::timestamp
            )`,
            referenceAt: sql`${endDate}::date + interval '1 day'`,
          })} in ('paye_et_archive', 'payed', 'manual_completed')
            or lifecycle.delivered_at is not null then 'realized'
          else 'exposed'
        end as contribution_state
      from selected_status as first_status
      inner join ${orders} on ${orders.id} = first_status.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_status.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join lifecycle on lifecycle.order_id = first_status.order_id
      left join line_economics on line_economics.order_id = first_status.order_id
      where ${startDate ? sql`first_status.day >= ${startDate}::date` : sql`true`}
        and first_status.day <= ${endDate}::date
    )
    select classified.day::text as date,
      count(*)::int as cohort_orders,
      count(*) filter (where classified.cost_complete)::int as cost_complete_orders,
      count(*) filter (where contribution_state = 'exposed')::int as return_exposed_orders,
      case when count(*) filter (where classified.gross_profit is not null) = 0 then null
        else coalesce(sum(classified.gross_profit)
          filter (where classified.gross_profit is not null), 0)::double precision
        end as gross_profit_dzd,
      coalesce(sum(classified.gross_profit)
        filter (where contribution_state = 'realized'), 0)::double precision
        as realized_gross_profit_dzd,
      coalesce(sum(classified.gross_profit)
        filter (where contribution_state = 'exposed'), 0)::double precision
        as return_exposed_gross_profit_dzd
    from classified
    group by classified.day
    order by classified.day
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row): OrderCohortDayEconomics => ({
    date: String(row.date),
    orderCount: numeric(row.cohort_orders),
    costCompleteOrders: numeric(row.cost_complete_orders),
    grossProfitDzd: row.gross_profit_dzd == null ? null : numeric(row.gross_profit_dzd),
    realizedGrossProfitDzd: numeric(row.realized_gross_profit_dzd),
    returnExposedGrossProfitDzd: numeric(row.return_exposed_gross_profit_dzd),
    returnExposedOrders: numeric(row.return_exposed_orders),
  }));
}

export async function loadAutomaticDayEconomics(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
  const rows = await loadOrderCohortDayEconomics(db, startDate, endDate, ORDER_STATUS.POSTED);
  return rows.map((row): AutomaticDayEconomics => ({
    date: row.date,
    postedOrders: row.orderCount,
    costCompleteOrders: row.costCompleteOrders,
    grossProfitDzd: row.grossProfitDzd,
    realizedGrossProfitDzd: row.realizedGrossProfitDzd,
    returnExposedGrossProfitDzd: row.returnExposedGrossProfitDzd,
    returnExposedOrders: row.returnExposedOrders,
  }));
}

export async function loadMetaDayEconomics(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
  const conditions = [lte(metaAdsDailyInsights.day, endDate)];
  if (startDate) conditions.push(gte(metaAdsDailyInsights.day, startDate));
  const rows = await db
    .select({
      date: metaAdsDailyInsights.day,
      accountCurrency: sql<
        string | null
      >`case when count(distinct ${metaAdsDailyInsights.accountCurrency}) = 1 then max(${metaAdsDailyInsights.accountCurrency}) else null end`,
      spendEur: sql<number>`coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision`,
      impressions: sql<number>`coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::double precision`,
      linkClicks: sql<number>`coalesce(sum(${metaAdsDailyInsights.inlineLinkClicks}), 0)::int`,
      landingPageViews: sql<number>`coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision`,
      purchases: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision`,
      metaSyncedAt: sql<Date | null>`max(${metaAdsDailyInsights.syncedAt})`,
    })
    .from(metaAdsDailyInsights)
    .where(and(...conditions))
    .groupBy(metaAdsDailyInsights.day)
    .orderBy(asc(metaAdsDailyInsights.day));

  return rows.map((row): MetaDayEconomics => {
    const spendEur = numeric(row.spendEur);
    const impressions = numeric(row.impressions);
    const linkClicks = numeric(row.linkClicks);
    return {
      date: row.date,
      accountCurrency: row.accountCurrency,
      spendEur,
      impressions,
      fbPurchases: numeric(row.purchases),
      cpm: impressions > 0 ? (spendEur / impressions) * 1_000 : 0,
      ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
      linkClicks,
      landingPageViews: numeric(row.landingPageViews),
      metaSyncedAt: isoTimestamp(row.metaSyncedAt),
    };
  });
}

export async function loadRealizedDayDates(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
  // Settlement-only dates consume Friday carry too, even when projection callers
  // do not need settlement amounts or operating-cost/adset reports.
  const result = await db.execute(sql`
    select distinct dates.date::text as date
    from (
      select (coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})
        at time zone ${sql.raw(`'${ANALYTICS_TIMEZONE}'`)})::date as date
      from ${processedOrders}
      union all
      select ${offPipelineSales.recognizedOn} as date
      from ${offPipelineSales}
    ) dates
    where dates.date <= ${endDate}::date
      and ${startDate ? sql`dates.date >= ${startDate}::date` : sql`true`}
  `);
  return (result.rows as Array<{ date: string }>).map((row) => row.date);
}

export async function loadRealizedDayEconomics(
  db: Database,
  startDate: string | null,
  endDate: string,
) {
  const result = await db.execute(sql`
    with realized as (
      select (
          coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})
          at time zone ${sql.raw(`'${ANALYTICS_TIMEZONE}'`)}
        )::date as day,
        case when ${processedOrders.importBatchId} = 'MANUAL' then 0 else 1 end as settled_orders,
        case when ${processedOrders.importBatchId} = 'MANUAL' then 1 else 0 end as off_pipeline_sales,
        ${processedOrders.amountCollected} as amount_collected,
        ${processedOrders.netRevenue} as net_revenue,
        ${processedOrders.totalFees} as total_fees,
        ${processedOrders.profit} as profit
      from ${processedOrders}
      union all
      select ${offPipelineSales.recognizedOn} as day,
        0 as settled_orders,
        1 as off_pipeline_sales,
        ${offPipelineSales.amountCollected} as amount_collected,
        (${offPipelineSales.amountCollected} - ${offPipelineSales.fees}) as net_revenue,
        ${offPipelineSales.fees} as total_fees,
        (${offPipelineSales.amountCollected} - ${offPipelineSales.fees} - ${offPipelineSales.productCost}) as profit
      from ${offPipelineSales}
    )
    select day::text as date,
      coalesce(sum(settled_orders), 0)::int as settled_orders,
      coalesce(sum(off_pipeline_sales), 0)::int as off_pipeline_sales,
      coalesce(sum(amount_collected), 0)::double precision as amount_collected_dzd,
      coalesce(sum(net_revenue), 0)::double precision as net_revenue_dzd,
      coalesce(sum(total_fees), 0)::double precision as fees_dzd,
      coalesce(sum(profit), 0)::double precision as realized_profit_dzd
    from realized
    where day is not null
      and ${startDate ? sql`day >= ${startDate}::date` : sql`true`}
      and day <= ${endDate}::date
    group by day
    order by day
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row): RealizedDayEconomics => ({
    date: String(row.date),
    settledOrders: numeric(row.settled_orders),
    offPipelineSales: numeric(row.off_pipeline_sales),
    amountCollectedDzd: numeric(row.amount_collected_dzd),
    netRevenueDzd: numeric(row.net_revenue_dzd),
    feesDzd: numeric(row.fees_dzd),
    realizedProfitDzd: numeric(row.realized_profit_dzd),
  }));
}

export async function listAdsetPerformance(
  startDate: string | null,
  endDate: string,
  dayByDate: Map<string, ReturnType<typeof applyProfitTrackerRollforward>[number]>,
  fallbackFxRate: number,
  db: Database,
) {
  const conditions = [lte(metaAdsDailyInsights.day, endDate)];
  if (startDate) conditions.push(gte(metaAdsDailyInsights.day, startDate));
  const rows = await db
    .select({
      day: metaAdsDailyInsights.day,
      adsetId: metaAdsDailyInsights.adsetId,
      adsetName: sql<string | null>`max(${metaAdsDailyInsights.adsetName})`,
      spend: sql<number>`coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision`,
      purchases: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision`,
      purchaseValue: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision`,
    })
    .from(metaAdsDailyInsights)
    .where(and(...conditions))
    .groupBy(metaAdsDailyInsights.day, metaAdsDailyInsights.adsetId)
    .orderBy(desc(metaAdsDailyInsights.day));

  const totalsByDay = new Map<string, { purchaseValue: number; purchases: number }>();
  for (const row of rows) {
    const current = totalsByDay.get(row.day) ?? { purchaseValue: 0, purchases: 0 };
    current.purchaseValue += numeric(row.purchaseValue);
    current.purchases += numeric(row.purchases);
    totalsByDay.set(row.day, current);
  }
  const byAdset = new Map<
    string,
    {
      adsetId: string;
      adsetName: string;
      days: number;
      spendEur: number;
      purchases: number;
      purchaseValue: number;
      adCostDzd: number;
      estimatedNetProfitDzd: number;
      hasEstimate: boolean;
    }
  >();
  for (const row of rows) {
    const current = byAdset.get(row.adsetId) ?? {
      adsetId: row.adsetId,
      adsetName: row.adsetName || row.adsetId,
      days: 0,
      spendEur: 0,
      purchases: 0,
      purchaseValue: 0,
      adCostDzd: 0,
      estimatedNetProfitDzd: 0,
      hasEstimate: false,
    };
    const spend = numeric(row.spend);
    const purchases = numeric(row.purchases);
    const purchaseValue = numeric(row.purchaseValue);
    const trackedDay = dayByDate.get(row.day);
    const fxRate = trackedDay?.fxRateUsed || fallbackFxRate;
    const adCostDzd = spend * fxRate;
    const dayTotals = totalsByDay.get(row.day)!;
    const share =
      dayTotals.purchaseValue > 0
        ? purchaseValue / dayTotals.purchaseValue
        : dayTotals.purchases > 0
          ? purchases / dayTotals.purchases
          : 0;
    current.days += 1;
    current.spendEur += spend;
    current.purchases += purchases;
    current.purchaseValue += purchaseValue;
    current.adCostDzd += adCostDzd;
    if (trackedDay?.metrics.adjustedProfitDzd != null) {
      current.estimatedNetProfitDzd += trackedDay.metrics.adjustedProfitDzd * share - adCostDzd;
      current.hasEstimate = true;
    }
    byAdset.set(row.adsetId, current);
  }

  return {
    summary: [...byAdset.values()]
      .map((row) => ({
        ...row,
        costPerPurchaseDzd: row.purchases > 0 ? row.adCostDzd / row.purchases : null,
      }))
      .sort((left, right) => right.spendEur - left.spendEur),
    daily: rows.map((row) => ({
      date: row.day,
      adsetId: row.adsetId,
      adsetName: row.adsetName || row.adsetId,
      spendEur: numeric(row.spend),
    })),
  };
}
