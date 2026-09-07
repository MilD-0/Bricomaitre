import { sql } from 'drizzle-orm';

import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderAcquisitionAttribution,
  orders,
} from '@bric/db/schema';
import type { AnalyticsFilters } from './contract';
import { ratio } from './metrics';
import { numeric, timestampPredicate } from './query-values';
import { type Database, paidShipmentStatusesSql } from './loaders-shared';

export async function loadMetaBreakdowns(db: Database, filters: AnalyticsFilters) {
  const maturationResult = await db.execute(sql`
      with paid as (
        select ${ecotrackOrderTrackingEvents.orderId} as order_id,
          min(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as paid_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'payed'
        group by ${ecotrackOrderTrackingEvents.orderId}
      ), attributed as (
        select ${orderAcquisitionAttribution.metaCampaignId} as campaign_id,
          ${orders.id} as order_id,
          (${orders.createdAt} at time zone 'Africa/Algiers')::date as ordered_day,
          paid.paid_at::date as paid_day,
          ${ecotrackOrderStates.currentStatus} as outcome
        from ${orderAcquisitionAttribution}
        inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
        left join paid on paid.order_id = ${orders.id}
        left join ${ecotrackOrderStates}
          on ${ecotrackOrderStates.orderId} = ${orders.id}
          and ${ecotrackOrderStates.deletedAt} is null
        where ${orderAcquisitionAttribution.channel} = 'meta_paid'
          and ${orderAcquisitionAttribution.metaCampaignId} is not null
          and ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
      )
      select campaign_id,
        count(*)::int as orders,
        count(*) filter (where ordered_day <= ${filters.endDate}::date)::int as eligible_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date
            and paid_day - ordered_day between 0 and 0
        )::int as paid_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
        )::int as eligible_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
            and paid_day - ordered_day between 0 and 3
        )::int as paid_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
        )::int as eligible_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
            and paid_day - ordered_day between 0 and 7
        )::int as paid_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
        )::int as eligible_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
            and paid_day - ordered_day between 0 and 14
        )::int as paid_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
        )::int as eligible_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and paid_day - ordered_day between 0 and 21
        )::int as paid_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and outcome in (${paidShipmentStatusesSql}, 'retour_archive')
        )::int as terminal
      from attributed
      group by campaign_id
      order by count(*) desc
    `);
  return {
    maturation: Array.from(maturationResult.rows as Iterable<unknown>, (raw) => {
      const row = raw as Record<string, unknown>;
      const ordersCount = numeric(row.orders);
      return {
        campaignId: String(row.campaign_id),
        orders: ordersCount,
        terminal: numeric(row.terminal),
        points: [
          { day: 0, paidRatePct: ratio(numeric(row.paid_d0), numeric(row.eligible_d0)) },
          { day: 3, paidRatePct: ratio(numeric(row.paid_d3), numeric(row.eligible_d3)) },
          { day: 7, paidRatePct: ratio(numeric(row.paid_d7), numeric(row.eligible_d7)) },
          { day: 14, paidRatePct: ratio(numeric(row.paid_d14), numeric(row.eligible_d14)) },
          { day: 21, paidRatePct: ratio(numeric(row.paid_d21), numeric(row.eligible_d21)) },
        ],
        maturityPct: ratio(numeric(row.terminal), numeric(row.eligible_d21)),
      };
    }),
  };
}
