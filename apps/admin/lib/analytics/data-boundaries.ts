import { sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsEvents,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  orders,
  orderStatusHistory,
  profitTrackerDays,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import { ISO_DATE_PATTERN } from './contract';

type Database = ReturnType<typeof getDb>;

export type AnalyticsCanonicalCutoffs = {
  orders: string | null;
  ordersFrom: string | null;
  posted: string | null;
  postedFrom: string | null;
  ecotrack: string | null;
  ecotrackFrom: string | null;
  paidFrom: string | null;
  meta: string | null;
  metaFrom: string | null;
  storefront: string | null;
  storefrontFrom: string | null;
};

export async function loadDatasetCutoffDate(db: Database) {
  const cutoff = sql`greatest(
    (select max(day) from admin.analytics_economics_daily_facts),
    (select max(posted_day) from admin.analytics_order_cohort_facts),
    (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}),
    (select max(${profitTrackerDays.day}) from ${profitTrackerDays}),
    (select max((${orders.createdAt} at time zone 'Africa/Algiers')::date) from ${orders}),
    (select max(${ecotrackOrderTrackingEvents.eventDate}) from ${ecotrackOrderTrackingEvents}),
    (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
      from ${analyticsEvents}),
    (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}),
    (select max(day) from search_console_daily_totals)
  )`;
  const result = await db.execute(sql`
    select to_char(${cutoff}, 'YYYY-MM-DD') as cutoff_date
  `);
  const value = (result.rows[0] as { cutoff_date?: unknown } | undefined)?.cutoff_date;
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
}

export async function loadCanonicalCutoffs(db: Database): Promise<AnalyticsCanonicalCutoffs> {
  const result = await db.execute(sql`
    select
      to_char(max((${orders.createdAt} at time zone 'Africa/Algiers')::date), 'YYYY-MM-DD')
        as orders_through,
      to_char(min((${orders.createdAt} at time zone 'Africa/Algiers')::date), 'YYYY-MM-DD')
        as orders_from,
      to_char((select max((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
        from ${orderStatusHistory} where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}), 'YYYY-MM-DD')
        as posted_through,
      to_char((select min((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
        from ${orderStatusHistory} where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}), 'YYYY-MM-DD')
        as posted_from,
      to_char((select max((coalesce(
        ${ecotrackOrderStates.lastOrderSyncedAt},
        ${ecotrackOrderStates.lastStatusSyncedAt},
        ${ecotrackOrderStates.updatedAt}
      ) at time zone 'Africa/Algiers')::date) from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null), 'YYYY-MM-DD') as ecotrack_through,
      to_char((select min(${ecotrackOrderTrackingEvents.eventDate})
        from ${ecotrackOrderTrackingEvents}), 'YYYY-MM-DD') as ecotrack_from,
      to_char((select min(${ecotrackOrderTrackingEvents.eventDate})
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'payed'), 'YYYY-MM-DD') as paid_from,
      to_char((select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}), 'YYYY-MM-DD')
        as meta_through,
      to_char((select min(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights}), 'YYYY-MM-DD')
        as meta_from,
      to_char(greatest(
        (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}),
        (select max((${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date)
          from ${analyticsEvents})
      ), 'YYYY-MM-DD') as storefront_through,
      to_char((
        with storefront_days as (
          select ${analyticsDailyRollups.day} as day
          from ${analyticsDailyRollups}
          where ${analyticsDailyRollups.dimension} = 'overall'
            and ${analyticsDailyRollups.dimensionKey} = ''
          union
          select (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date as day
          from ${analyticsEvents}
        ), ordered_days as (
          select day, lag(day) over (order by day) as previous_day
          from storefront_days
        )
        select coalesce(
          max(day) filter (where previous_day is not null and day - previous_day > 7),
          min(day)
        )
        from ordered_days
      ), 'YYYY-MM-DD') as storefront_from
    from ${orders}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const date = (value: unknown) =>
    typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
  return {
    orders: date(row.orders_through),
    ordersFrom: date(row.orders_from),
    posted: date(row.posted_through),
    postedFrom: date(row.posted_from),
    ecotrack: date(row.ecotrack_through),
    ecotrackFrom: date(row.ecotrack_from),
    paidFrom: date(row.paid_from),
    meta: date(row.meta_through),
    metaFrom: date(row.meta_from),
    storefront: date(row.storefront_through),
    storefrontFrom: date(row.storefront_from),
  };
}

export function commonCutoff(...dates: Array<string | null>) {
  if (dates.some((date) => date == null)) return null;
  return [...(dates as string[])].sort().at(0) ?? null;
}

export function commonCoverageStart(...dates: Array<string | null>) {
  if (dates.some((date) => date == null)) return null;
  return [...(dates as string[])].sort().at(-1) ?? null;
}
