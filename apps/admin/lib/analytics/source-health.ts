import { sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsDailyRollups,
  analyticsEvents,
  ecotrackOrderStates,
  metaAdsDailyInsights,
  profitTrackerDays,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import type { getProfitTrackerReport } from '../profit-tracker';
import type { AnalyticsFilters, AnalyticsSource } from './contract';
import { inclusiveDays, dayInTimezone } from './date-range';
import { metaCoverageThroughSql } from './data-boundaries';
import { datePredicate, isoValue, numeric, timestampPredicate } from './query-values';

type Database = ReturnType<typeof getDb>;
type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

export function freshnessState(
  throughDate: string | null,
  endDate: string,
): AnalyticsSource['state'] {
  if (!throughDate) return 'missing';
  const lag = Math.max(0, inclusiveDays(throughDate.slice(0, 10), endDate) - 1);
  if (lag <= 1) return 'current';
  if (lag <= 3) return 'lagged';
  return 'partial';
}

export async function loadSourceHealth(
  db: Database,
  filters: AnalyticsFilters,
  economics?: EconomicsReport,
): Promise<AnalyticsSource[]> {
  const result = await db.execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), posted as (
      select first_posted.order_id,
        first_posted.posted_day,
        ${ecotrackOrderStates.orderId} as tracked_order_id
      from first_posted
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_posted.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      where ${datePredicate(sql`first_posted.posted_day`, filters.startDate, filters.endDate)}
    )
    select
      (select count(*)::int from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as order_records,
      least(${filters.endDate}::date, ${dayInTimezone(new Date())}::date) as orders_through_date,
      (select max(${orders.updatedAt}) from ${orders}) as orders_updated_at,
      (select count(*)::int from posted) as posted_records,
      (select count(tracked_order_id)::int from posted) as ecotrack_records,
      (select max(${ecotrackOrderStates.updatedAt}) from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null) as ecotrack_updated_at,
      (select (max(coalesce(
          ${ecotrackOrderStates.lastOrderSyncedAt},
          ${ecotrackOrderStates.lastStatusSyncedAt},
          ${ecotrackOrderStates.updatedAt}
        )) at time zone 'Africa/Algiers')::date
        from ${ecotrackOrderStates}
        where ${ecotrackOrderStates.deletedAt} is null) as ecotrack_through_date,
      (select count(distinct day)::int from (
        select ${metaAdsDailyInsights.day} as day from ${metaAdsDailyInsights}
          where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)}
        union
        select ${profitTrackerDays.day} as day from ${profitTrackerDays}
          where ${profitTrackerDays.metaSyncedAt} is not null
            and ${datePredicate(profitTrackerDays.day, filters.startDate, filters.endDate)}
      ) covered_meta_days) as meta_days,
      case when ${metaCoverageThroughSql} is null then null
        else least(${filters.endDate}::date, ${metaCoverageThroughSql}) end as meta_through_date,
      greatest(
        (select max(${metaAdsDailyInsights.syncedAt}) from ${metaAdsDailyInsights}),
        (select max(${profitTrackerDays.metaSyncedAt}) from ${profitTrackerDays})
      ) as meta_updated_at,
      (select count(*)::int from ${analyticsDailyRollups}
        where ${analyticsDailyRollups.dimension} = 'overall'
          and ${datePredicate(analyticsDailyRollups.day, filters.startDate, filters.endDate)})
        +
      (select count(*)::int from ${analyticsEvents}
        where ${timestampPredicate(analyticsEvents.occurredAt, filters.startDate, filters.endDate)})
        as storefront_records,
      (select count(distinct day)::int from (
        select ${analyticsDailyRollups.day} as day from ${analyticsDailyRollups}
          where ${analyticsDailyRollups.dimension} = 'overall'
            and ${datePredicate(analyticsDailyRollups.day, filters.startDate, filters.endDate)}
        union
        select (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date as day
          from ${analyticsEvents}
          where ${timestampPredicate(analyticsEvents.occurredAt, filters.startDate, filters.endDate)}
      ) storefront_days) as storefront_days,
      greatest(
        (select max(${analyticsDailyRollups.day}) from ${analyticsDailyRollups}
          where ${datePredicate(analyticsDailyRollups.day, filters.startDate, filters.endDate)}),
        (select (max(${analyticsEvents.occurredAt}) at time zone 'Africa/Algiers')::date
          from ${analyticsEvents}
          where ${timestampPredicate(analyticsEvents.occurredAt, filters.startDate, filters.endDate)})
      ) as storefront_through_date,
      greatest(
        (select max(${analyticsDailyRollups.updatedAt}) from ${analyticsDailyRollups}),
        (select max(${analyticsEvents.createdAt}) from ${analyticsEvents})
      ) as storefront_updated_at
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const postedRecords = numeric(row.posted_records);
  const metaDays = numeric(row.meta_days);
  const storefrontDays = numeric(row.storefront_days);
  const expectedDays = filters.startDate ? inclusiveDays(filters.startDate, filters.endDate) : null;
  const metaThrough = row.meta_through_date ? String(row.meta_through_date) : null;
  const storefrontThrough = row.storefront_through_date
    ? String(row.storefront_through_date)
    : null;
  const ordersThrough = row.orders_through_date ? String(row.orders_through_date) : null;
  const ecotrackThrough = row.ecotrack_through_date ? String(row.ecotrack_through_date) : null;
  return [
    {
      key: 'orders',
      state: freshnessState(ordersThrough, filters.endDate),
      updatedAt: isoValue(row.orders_updated_at),
      throughDate: ordersThrough,
      records: numeric(row.order_records),
      coveragePct: 100,
    },
    {
      key: 'ecotrack',
      state: freshnessState(ecotrackThrough, filters.endDate),
      updatedAt: isoValue(row.ecotrack_updated_at),
      throughDate: ecotrackThrough,
      records: numeric(row.ecotrack_records),
      coveragePct: postedRecords > 0 ? (numeric(row.ecotrack_records) / postedRecords) * 100 : null,
    },
    {
      key: 'meta',
      state: freshnessState(metaThrough, filters.endDate),
      updatedAt: isoValue(row.meta_updated_at),
      throughDate: metaThrough,
      records: metaDays,
      coveragePct: expectedDays && expectedDays > 0 ? (metaDays / expectedDays) * 100 : null,
    },
    {
      key: 'storefront',
      state: freshnessState(storefrontThrough, filters.endDate),
      updatedAt: isoValue(row.storefront_updated_at),
      throughDate: storefrontThrough,
      records: numeric(row.storefront_records),
      coveragePct: expectedDays && expectedDays > 0 ? (storefrontDays / expectedDays) * 100 : null,
    },
    {
      key: 'assumptions',
      state: 'manual',
      updatedAt: null,
      throughDate: null,
      records:
        economics?.days.filter(
          (day) =>
            day.grossProfitSource === 'manual' ||
            day.returnRateSource === 'manual' ||
            day.confirmedOrdersSource === 'manual',
        ).length ?? 0,
      coveragePct: null,
    },
  ];
}
