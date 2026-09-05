import { sql } from 'drizzle-orm';

import {
  brands,
  categories,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  orderStatusHistory,
  profitTrackerDays,
  products as productCatalog,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE } from '../analytics-fact-contract';
import { effectiveEcotrackStatusSql } from '../ecotrack-status-policy';
import type { AnalyticsFilters } from './contract';
import { ratio } from './metrics';
import { datePredicate, nullableNumeric, numeric, timestampPredicate } from './query-values';
import {
  type Database,
  resolvedShipmentStatusesSql,
  stateAwareContributionSql,
} from './loaders-shared';

export async function loadBasketPairs(db: Database, filters: AnalyticsFilters) {
  const result = await db.execute(sql`
    select least(left_item.title_snapshot, right_item.title_snapshot) as left_title,
      greatest(left_item.title_snapshot, right_item.title_snapshot) as right_title,
      count(distinct left_item.order_id)::int as orders
    from ${orderLineItems} left_item
    inner join ${orderLineItems} right_item
      on right_item.order_id = left_item.order_id
      and right_item.id > left_item.id
      and right_item.content_id <> left_item.content_id
      and coalesce(right_item.product_id::text, right_item.raw_value) <>
        coalesce(left_item.product_id::text, left_item.raw_value)
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

export type OperationalProductRow = {
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

export async function loadOperationalProducts(
  db: Database,
  filters: AnalyticsFilters,
  planningReturnRatePct: number,
): Promise<OperationalProductRow[]> {
  const effectiveStatus = effectiveEcotrackStatusSql({
    localStatus: orders.inHouseStatus,
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
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
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

export type ProductMetaAssociation = {
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

export async function loadProductMetaAssociations(
  db: Database,
  filters: AnalyticsFilters,
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
