import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackWilayas,
  metaAdsBreakdownDailyInsights,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
import {
  correctedEcotrackStatusSql,
  effectiveEcotrackStatusSql,
} from '../../ecotrack-status-policy';
import type { AnalyticsFilters } from '../contract';
import { type Database, resolvedShipmentStatusesSql } from '../loaders-shared';
import { ratio } from '../metrics';
import { datePredicate, nullableNumeric, numeric } from '../query-values';

export type OperationalGeographyRow = {
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

export async function loadOperationalGeography(
  db: Database,
  filters: AnalyticsFilters,
): Promise<OperationalGeographyRow[]> {
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
    ), selected_posted as materialized (
      select * from first_posted
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
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
      inner join selected_posted on selected_posted.order_id = ${ecotrackOrderTrackingEvents.orderId}
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
        extract(epoch from (lifecycle.delivered_at - (first_posted.posted_at at time zone 'Africa/Algiers'))) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      count(*) filter (where lifecycle.delivered_at is not null)::int as delivery_samples,
      avg(lifecycle.attempt_count) filter (
        where lifecycle.attempt_count is not null
      ) as average_attempts
    from selected_posted as first_posted
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

export async function loadOperationalCommunes(db: Database, filters: AnalyticsFilters) {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        ${orderStatusHistory.changedAt} as posted_at,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), selected_posted as materialized (
      select * from first_posted
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
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
      inner join selected_posted on selected_posted.order_id = ${ecotrackOrderTrackingEvents.orderId}
      group by ${ecotrackOrderTrackingEvents.orderId}
    )
    select ${orders.state} as wilaya_id,
      coalesce(${ecotrackWilayas.name}, 'Unknown') as wilaya_name,
      coalesce(nullif(trim(${orders.city}), ''), 'Unknown') as commune_name,
      count(*)::int as posted_orders,
      count(*) filter (
        where ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} in ('paye_et_archive', 'payed')
      )::int
        as paid_orders,
      count(*) filter (where ${correctedEcotrackStatusSql({ localStatus: orders.inHouseStatus, providerStatus: ecotrackOrderStates.currentStatus })} = 'retour_archive')::int
        as returned_orders,
      percentile_cont(0.5) within group (order by
        extract(epoch from (lifecycle.delivered_at - (first_posted.posted_at at time zone 'Africa/Algiers'))) / 3600
      ) filter (where lifecycle.delivered_at is not null)::double precision
        as delivery_median_hours,
      avg(lifecycle.attempt_count) filter (
        where lifecycle.attempt_count is not null
      ) as average_attempts
    from selected_posted as first_posted
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

export async function loadMetaRegions(db: Database, filters: AnalyticsFilters) {
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
