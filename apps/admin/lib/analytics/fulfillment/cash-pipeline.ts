import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
import { effectiveEcotrackStatusSql } from '../../ecotrack-status-policy';
import type {
  AnalyticsCashStage,
  AnalyticsFilters,
  AnalyticsLeadingOrderForecast,
} from '../contract';
import { type Database } from '../loaders-shared';
import { ratio } from '../metrics';
import { datePredicate, numeric } from '../query-values';

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
