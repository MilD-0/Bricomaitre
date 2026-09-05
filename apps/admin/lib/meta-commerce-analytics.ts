import { desc, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  ecotrackOrderStates,
  metaAdsDailyInsights,
  metaAdsSyncRuns,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  processedOrders,
} from '@bric/db/schema';
import {
  CONFIRMED_LIFECYCLE_ORDER_STATUSES,
  ORDER_STATUS,
} from '@bric/storefront-core/order-domain';
import { ANALYTICS_PAID_SHIPMENT_STATUSES } from './ecotrack-status-policy';

type Database = ReturnType<typeof getDb>;

const META_COMMERCE_DISPATCHED_STATUSES = CONFIRMED_LIFECYCLE_ORDER_STATUSES.filter(
  (status) => status !== ORDER_STATUS.CONFIRMED,
);
const META_COMMERCE_COMPLETED_STATUSES = [
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.MANUAL_COMPLETED,
] as const;
const META_COMMERCE_NEGATIVE_OUTCOME_STATUSES = [
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
] as const;

export type MetaCommerceFilters = {
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type MetaCommercePerformanceRow = {
  day: string;
  accountCurrency: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  spend: number;
  impressions: number;
  metaClicks: number;
  metaLandingPageViews: number;
  metaPurchases: number;
  metaPurchaseValue: number;
  bricOrders: number;
  confirmedOrders: number;
  dispatchedOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  negativeOutcomeOrders: number;
  paidOrders: number;
  returnedOrders: number;
  submittedValueDzd: number;
  costCompleteOrders: number;
  estimatedProductCostDzd: number | null;
  estimatedDeliveryFeesDzd: number;
  settledOrders: number;
  amountCollectedDzd: number;
  netRevenueDzd: number;
  realizedProfitDzd: number | null;
  metaSyncedAt: string | null;
};

export type MetaCommerceReport = {
  summary: {
    accountCurrency: string | null;
    spend: number;
    impressions: number;
    metaClicks: number;
    metaLandingPageViews: number;
    metaPurchases: number;
    metaPurchaseValue: number;
    bricOrders: number;
    confirmedOrders: number;
    dispatchedOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    negativeOutcomeOrders: number;
    paidOrders: number;
    returnedOrders: number;
    submittedValueDzd: number;
    costCompleteOrders: number;
    settledOrders: number;
    amountCollectedDzd: number;
    netRevenueDzd: number;
    metaSyncedAt: string | null;
  };
  rows: MetaCommercePerformanceRow[];
  sync: {
    status: string;
    sinceDay: string;
    untilDay: string;
    rowsUpserted: number;
    errorCode: string | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
};

export function emptyMetaCommerceReport(): MetaCommerceReport {
  return {
    summary: {
      accountCurrency: null,
      spend: 0,
      impressions: 0,
      metaClicks: 0,
      metaLandingPageViews: 0,
      metaPurchases: 0,
      metaPurchaseValue: 0,
      bricOrders: 0,
      confirmedOrders: 0,
      dispatchedOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      negativeOutcomeOrders: 0,
      paidOrders: 0,
      returnedOrders: 0,
      submittedValueDzd: 0,
      costCompleteOrders: 0,
      settledOrders: 0,
      amountCollectedDzd: 0,
      netRevenueDzd: 0,
      metaSyncedAt: null,
    },
    rows: [],
    sync: null,
  };
}

function dateFilter(column: unknown, filters: MetaCommerceFilters) {
  return sql`${filters.startDate ? sql`${column} >= ${filters.startDate}::date` : sql`true`}
    and ${filters.endDate ? sql`${column} <= ${filters.endDate}::date` : sql`true`}`;
}

export function buildMetaCommercePerformanceQuery(
  filters: MetaCommerceFilters,
  canViewProfit: boolean,
) {
  const cohortDay = sql`(${orderAcquisitionAttribution.capturedAt} at time zone 'Africa/Algiers')::date`;
  const confirmedStatuses = [...CONFIRMED_LIFECYCLE_ORDER_STATUSES];
  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 20)));

  return sql`
    with line_economics as (
      select ${orderLineItems.orderId} as order_id,
        coalesce(sum(${orderLineItems.lineTotal}), 0)::double precision as submitted_product_value,
        coalesce(sum(${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}), 0)::double precision as product_cost,
        bool_and(${orderLineItems.unitPurchasePriceSnapshot} is not null) as cost_complete
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), settlement as (
      select ${processedOrders.orderId} as order_id,
        count(*)::int as records,
        coalesce(sum(${processedOrders.amountCollected}), 0)::double precision as amount_collected,
        coalesce(sum(${processedOrders.netRevenue}), 0)::double precision as net_revenue,
        coalesce(sum(${processedOrders.profit}), 0)::double precision as realized_profit
      from ${processedOrders}
      group by ${processedOrders.orderId}
    ), spend as (
      select ${metaAdsDailyInsights.day} as day,
        ${metaAdsDailyInsights.accountCurrency} as account_currency,
        ${metaAdsDailyInsights.campaignId} as campaign_id,
        max(${metaAdsDailyInsights.campaignName}) as campaign_name,
        ${metaAdsDailyInsights.adsetId} as adset_id,
        max(${metaAdsDailyInsights.adsetName}) as adset_name,
        ${metaAdsDailyInsights.adId} as ad_id,
        max(${metaAdsDailyInsights.adName}) as ad_name,
        coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision as spend,
        coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::bigint as impressions,
        coalesce(sum(${metaAdsDailyInsights.clicks}), 0)::bigint as meta_clicks,
        coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision as meta_landing_page_views,
        coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision as meta_purchases,
        coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision as meta_purchase_value,
        max(${metaAdsDailyInsights.syncedAt}) as synced_at
      from ${metaAdsDailyInsights}
      where ${dateFilter(metaAdsDailyInsights.day, filters)}
      group by 1, 2, 3, 5, 7
    ), order_cohorts as (
      select ${cohortDay} as day,
        max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
        max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
        ${orderAcquisitionAttribution.metaAdId} as ad_id,
        count(*)::int as bric_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, confirmedStatuses)})::int as confirmed_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, META_COMMERCE_DISPATCHED_STATUSES)})::int as dispatched_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, [...META_COMMERCE_COMPLETED_STATUSES])})::int as completed_orders,
        count(*) filter (where ${orders.inHouseStatus} = ${ORDER_STATUS.CANCELLED})::int as cancelled_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, [...META_COMMERCE_NEGATIVE_OUTCOME_STATUSES])})::int as negative_outcome_orders,
        count(*) filter (
          where ${inArray(ecotrackOrderStates.currentStatus, [...ANALYTICS_PAID_SHIPMENT_STATUSES])}
        )::int as paid_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int as returned_orders,
        coalesce(sum(coalesce(line_economics.submitted_product_value, ${orders.price}::double precision, 0)), 0)::double precision as submitted_value_dzd,
        count(*) filter (where line_economics.cost_complete)::int as cost_complete_orders,
        ${
          canViewProfit
            ? sql`coalesce(sum(line_economics.product_cost), 0)::double precision`
            : sql`null::double precision`
        } as estimated_product_cost_dzd,
        coalesce(sum(${ecotrackOrderStates.estimatedFee}), 0)::double precision as estimated_delivery_fees_dzd,
        count(*) filter (where settlement.records > 0)::int as settled_orders,
        coalesce(sum(settlement.amount_collected), 0)::double precision as amount_collected_dzd,
        coalesce(sum(settlement.net_revenue), 0)::double precision as net_revenue_dzd,
        ${
          canViewProfit
            ? sql`coalesce(sum(settlement.realized_profit), 0)::double precision`
            : sql`null::double precision`
        } as realized_profit_dzd
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      left join line_economics on line_economics.order_id = ${orders.id}
      left join ${ecotrackOrderStates} on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join settlement on settlement.order_id = ${orders.id}::text
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
        and ${dateFilter(cohortDay, filters)}
      group by 1, 4
    )
    select coalesce(spend.day, order_cohorts.day)::text as day,
      spend.account_currency as "accountCurrency",
      coalesce(spend.campaign_id, order_cohorts.campaign_id) as "campaignId",
      spend.campaign_name as "campaignName",
      coalesce(spend.adset_id, order_cohorts.adset_id) as "adsetId",
      spend.adset_name as "adsetName",
      coalesce(spend.ad_id, order_cohorts.ad_id) as "adId",
      spend.ad_name as "adName",
      coalesce(spend.spend, 0) as spend,
      coalesce(spend.impressions, 0)::int as impressions,
      coalesce(spend.meta_clicks, 0)::int as "metaClicks",
      coalesce(spend.meta_landing_page_views, 0) as "metaLandingPageViews",
      coalesce(spend.meta_purchases, 0) as "metaPurchases",
      coalesce(spend.meta_purchase_value, 0) as "metaPurchaseValue",
      coalesce(order_cohorts.bric_orders, 0)::int as "bricOrders",
      coalesce(order_cohorts.confirmed_orders, 0)::int as "confirmedOrders",
      coalesce(order_cohorts.dispatched_orders, 0)::int as "dispatchedOrders",
      coalesce(order_cohorts.completed_orders, 0)::int as "completedOrders",
      coalesce(order_cohorts.cancelled_orders, 0)::int as "cancelledOrders",
      coalesce(order_cohorts.negative_outcome_orders, 0)::int as "negativeOutcomeOrders",
      coalesce(order_cohorts.paid_orders, 0)::int as "paidOrders",
      coalesce(order_cohorts.returned_orders, 0)::int as "returnedOrders",
      coalesce(order_cohorts.submitted_value_dzd, 0) as "submittedValueDzd",
      coalesce(order_cohorts.cost_complete_orders, 0)::int as "costCompleteOrders",
      order_cohorts.estimated_product_cost_dzd as "estimatedProductCostDzd",
      coalesce(order_cohorts.estimated_delivery_fees_dzd, 0) as "estimatedDeliveryFeesDzd",
      coalesce(order_cohorts.settled_orders, 0)::int as "settledOrders",
      coalesce(order_cohorts.amount_collected_dzd, 0) as "amountCollectedDzd",
      coalesce(order_cohorts.net_revenue_dzd, 0) as "netRevenueDzd",
      order_cohorts.realized_profit_dzd as "realizedProfitDzd",
      spend.synced_at as "metaSyncedAt"
    from spend
    full outer join order_cohorts
      on order_cohorts.day = spend.day
      and order_cohorts.ad_id = spend.ad_id
    order by coalesce(spend.spend, 0) desc, coalesce(spend.day, order_cohorts.day) desc
    limit ${limit}
  `;
}

export function buildMetaCommerceSummaryQuery(filters: MetaCommerceFilters) {
  const cohortDay = sql`(${orderAcquisitionAttribution.capturedAt} at time zone 'Africa/Algiers')::date`;
  const confirmedStatuses = [...CONFIRMED_LIFECYCLE_ORDER_STATUSES];

  return sql`
    with spend as (
      select case when count(distinct ${metaAdsDailyInsights.accountCurrency}) = 1
          then max(${metaAdsDailyInsights.accountCurrency}) else null end as account_currency,
        coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision as spend,
        coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::bigint as impressions,
        coalesce(sum(${metaAdsDailyInsights.clicks}), 0)::bigint as meta_clicks,
        coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision as meta_landing_page_views,
        coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision as meta_purchases,
        coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision as meta_purchase_value,
        max(${metaAdsDailyInsights.syncedAt}) as meta_synced_at
      from ${metaAdsDailyInsights}
      where ${dateFilter(metaAdsDailyInsights.day, filters)}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        coalesce(sum(${orderLineItems.lineTotal}), 0)::double precision as submitted_product_value,
        bool_and(${orderLineItems.unitPurchasePriceSnapshot} is not null) as cost_complete
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), settlement as (
      select ${processedOrders.orderId} as order_id,
        count(*)::int as records,
        coalesce(sum(${processedOrders.amountCollected}), 0)::double precision as amount_collected,
        coalesce(sum(${processedOrders.netRevenue}), 0)::double precision as net_revenue
      from ${processedOrders}
      group by ${processedOrders.orderId}
    ), outcomes as (
      select count(*)::int as bric_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, confirmedStatuses)})::int as confirmed_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, META_COMMERCE_DISPATCHED_STATUSES)})::int as dispatched_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, [...META_COMMERCE_COMPLETED_STATUSES])})::int as completed_orders,
        count(*) filter (where ${orders.inHouseStatus} = ${ORDER_STATUS.CANCELLED})::int as cancelled_orders,
        count(*) filter (where ${inArray(orders.inHouseStatus, [...META_COMMERCE_NEGATIVE_OUTCOME_STATUSES])})::int as negative_outcome_orders,
        count(*) filter (
          where ${inArray(ecotrackOrderStates.currentStatus, [...ANALYTICS_PAID_SHIPMENT_STATUSES])}
        )::int as paid_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int as returned_orders,
        coalesce(sum(coalesce(line_economics.submitted_product_value, ${orders.price}::double precision, 0)), 0)::double precision as submitted_value_dzd,
        count(*) filter (where line_economics.cost_complete)::int as cost_complete_orders,
        count(*) filter (where settlement.records > 0)::int as settled_orders,
        coalesce(sum(settlement.amount_collected), 0)::double precision as amount_collected_dzd,
        coalesce(sum(settlement.net_revenue), 0)::double precision as net_revenue_dzd
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      left join line_economics on line_economics.order_id = ${orders.id}
      left join ${ecotrackOrderStates} on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join settlement on settlement.order_id = ${orders.id}::text
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
        and ${dateFilter(cohortDay, filters)}
    )
    select spend.*, outcomes.* from spend cross join outcomes
  `;
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return value == null ? null : String(value);
}

function isoValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getMetaCommercePerformance(
  db: Database,
  filters: MetaCommerceFilters,
  canViewProfit: boolean,
): Promise<MetaCommercePerformanceRow[]> {
  const result = await db.execute(buildMetaCommercePerformanceQuery(filters, canViewProfit));
  return result.rows.map((raw: unknown) => {
    const row = raw as Record<string, unknown>;
    return {
      day: String(row.day),
      accountCurrency: stringValue(row.accountCurrency),
      campaignId: stringValue(row.campaignId),
      campaignName: stringValue(row.campaignName),
      adsetId: stringValue(row.adsetId),
      adsetName: stringValue(row.adsetName),
      adId: stringValue(row.adId),
      adName: stringValue(row.adName),
      spend: numberValue(row.spend),
      impressions: numberValue(row.impressions),
      metaClicks: numberValue(row.metaClicks),
      metaLandingPageViews: numberValue(row.metaLandingPageViews),
      metaPurchases: numberValue(row.metaPurchases),
      metaPurchaseValue: numberValue(row.metaPurchaseValue),
      bricOrders: numberValue(row.bricOrders),
      confirmedOrders: numberValue(row.confirmedOrders),
      dispatchedOrders: numberValue(row.dispatchedOrders),
      completedOrders: numberValue(row.completedOrders),
      cancelledOrders: numberValue(row.cancelledOrders),
      negativeOutcomeOrders: numberValue(row.negativeOutcomeOrders),
      paidOrders: numberValue(row.paidOrders),
      returnedOrders: numberValue(row.returnedOrders),
      submittedValueDzd: numberValue(row.submittedValueDzd),
      costCompleteOrders: numberValue(row.costCompleteOrders),
      estimatedProductCostDzd:
        row.estimatedProductCostDzd == null ? null : numberValue(row.estimatedProductCostDzd),
      estimatedDeliveryFeesDzd: numberValue(row.estimatedDeliveryFeesDzd),
      settledOrders: numberValue(row.settledOrders),
      amountCollectedDzd: numberValue(row.amountCollectedDzd),
      netRevenueDzd: numberValue(row.netRevenueDzd),
      realizedProfitDzd: row.realizedProfitDzd == null ? null : numberValue(row.realizedProfitDzd),
      metaSyncedAt: isoValue(row.metaSyncedAt),
    };
  });
}

export async function getMetaCommerceReport(
  db: Database,
  filters: MetaCommerceFilters,
  canViewProfit: boolean,
): Promise<MetaCommerceReport> {
  const [rows, summaryResult, syncRows] = await Promise.all([
    getMetaCommercePerformance(db, { ...filters, limit: filters.limit ?? 25 }, canViewProfit),
    db.execute(buildMetaCommerceSummaryQuery(filters)),
    db
      .select({
        status: metaAdsSyncRuns.status,
        sinceDay: metaAdsSyncRuns.sinceDay,
        untilDay: metaAdsSyncRuns.untilDay,
        rowsUpserted: metaAdsSyncRuns.rowsUpserted,
        errorCode: metaAdsSyncRuns.errorCode,
        startedAt: metaAdsSyncRuns.startedAt,
        completedAt: metaAdsSyncRuns.completedAt,
      })
      .from(metaAdsSyncRuns)
      .orderBy(desc(metaAdsSyncRuns.startedAt))
      .limit(1),
  ]);
  const rawSummary = (summaryResult.rows[0] ?? {}) as Record<string, unknown>;
  const sync = syncRows[0];

  return {
    summary: {
      accountCurrency: stringValue(rawSummary.account_currency),
      spend: numberValue(rawSummary.spend),
      impressions: numberValue(rawSummary.impressions),
      metaClicks: numberValue(rawSummary.meta_clicks),
      metaLandingPageViews: numberValue(rawSummary.meta_landing_page_views),
      metaPurchases: numberValue(rawSummary.meta_purchases),
      metaPurchaseValue: numberValue(rawSummary.meta_purchase_value),
      bricOrders: numberValue(rawSummary.bric_orders),
      confirmedOrders: numberValue(rawSummary.confirmed_orders),
      dispatchedOrders: numberValue(rawSummary.dispatched_orders),
      completedOrders: numberValue(rawSummary.completed_orders),
      cancelledOrders: numberValue(rawSummary.cancelled_orders),
      negativeOutcomeOrders: numberValue(rawSummary.negative_outcome_orders),
      paidOrders: numberValue(rawSummary.paid_orders),
      returnedOrders: numberValue(rawSummary.returned_orders),
      submittedValueDzd: numberValue(rawSummary.submitted_value_dzd),
      costCompleteOrders: numberValue(rawSummary.cost_complete_orders),
      settledOrders: numberValue(rawSummary.settled_orders),
      amountCollectedDzd: numberValue(rawSummary.amount_collected_dzd),
      netRevenueDzd: numberValue(rawSummary.net_revenue_dzd),
      metaSyncedAt: isoValue(rawSummary.meta_synced_at),
    },
    rows,
    sync: sync
      ? {
          status: sync.status,
          sinceDay: String(sync.sinceDay),
          untilDay: String(sync.untilDay),
          rowsUpserted: sync.rowsUpserted,
          errorCode: sync.errorCode,
          startedAt: sync.startedAt.toISOString(),
          completedAt: sync.completedAt?.toISOString() ?? null,
        }
      : null,
  };
}
