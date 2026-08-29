import { sql } from 'drizzle-orm';

import { analyticsEvents, orders } from '@bric/db/schema';
import { getCanonicalStorefrontSessionCount } from '../stats';
import type { AnalyticsFilters } from './contract';
import { addDays, dayInTimezone } from './date-range';
import { ratio } from './metrics';
import { numeric, timestampPredicate } from './query-values';
import { type Database, statsInput } from './loaders-shared';

export function storefrontPathCoverage(filters: AnalyticsFilters, now = new Date()) {
  const retainedFrom = addDays(dayInTimezone(now), -6);
  const coverageStartDate =
    filters.startDate && filters.startDate > retainedFrom ? filters.startDate : retainedFrom;
  const coverageEndDate = filters.endDate;
  return {
    coverageStartDate,
    coverageEndDate,
    coverageIsPartial: !filters.startDate || coverageStartDate > filters.startDate,
  };
}

export async function loadStorefrontPaths(
  db: Database,
  filters: AnalyticsFilters,
  now = new Date(),
) {
  const coverage = storefrontPathCoverage(filters, now);
  const { coverageStartDate, coverageEndDate } = coverage;
  if (coverageStartDate > coverageEndDate) {
    return { ...coverage, coverageIsPartial: true, rows: [] };
  }
  const result = await db.execute(sql`
    with sequence as (
      select ${analyticsEvents.sessionId} as session_id,
        coalesce(nullif(${analyticsEvents.pagePath}, ''), '(unknown)') as from_path,
        lead(coalesce(nullif(${analyticsEvents.pagePath}, ''), '(unknown)')) over (
          partition by ${analyticsEvents.sessionId}
          order by ${analyticsEvents.occurredAt}, ${analyticsEvents.id}
        ) as to_path
      from ${analyticsEvents}
      where ${analyticsEvents.eventName} = 'page_view'
        and ${timestampPredicate(analyticsEvents.occurredAt, coverageStartDate, coverageEndDate)}
    )
    select from_path, to_path,
      count(*)::int as transitions,
      count(distinct session_id)::int as sessions
    from sequence
    where to_path is not null and from_path <> to_path
    group by from_path, to_path
    order by count(distinct session_id) desc, count(*) desc
    limit 24
  `);
  return {
    ...coverage,
    rows: result.rows.map((raw: unknown) => {
      const row = raw as Record<string, unknown>;
      return {
        from: String(row.from_path),
        to: String(row.to_path),
        transitions: numeric(row.transitions),
        sessions: numeric(row.sessions),
      };
    }),
  };
}

export async function loadStorefrontOrderConversion(db: Database, filters: AnalyticsFilters) {
  const [sessions, result] = await Promise.all([
    getCanonicalStorefrontSessionCount(statsInput(filters.startDate, filters.endDate)),
    db.execute(sql`
      select (select count(*)::int from ${orders}
        where ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)})
        as submitted_orders
    `),
  ]);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const submittedOrders = numeric(row.submitted_orders);
  return {
    sessions,
    submittedOrders,
    conversionRatePct: ratio(submittedOrders, sessions),
  };
}

export async function loadStorefrontSessionFunnel(
  db: Database,
  startDate: string,
  endDate: string,
) {
  const result = await db.execute(sql`
    with session_stages as (
      select ${analyticsEvents.sessionId} as session_id,
        bool_or(${analyticsEvents.eventName} = 'page_view') as visited,
        bool_or(${analyticsEvents.eventName} = 'view_item') as viewed_product,
        bool_or(${analyticsEvents.eventName} = 'add_to_cart') as added_to_cart,
        bool_or(${analyticsEvents.eventName} = 'begin_checkout') as began_checkout
      from ${analyticsEvents}
      where ${timestampPredicate(analyticsEvents.occurredAt, startDate, endDate)}
      group by ${analyticsEvents.sessionId}
    ), submitted_sessions as (
      select distinct ${orders.sessionId} as session_id
      from ${orders}
      where ${orders.sessionId} is not null
        and ${timestampPredicate(orders.createdAt, startDate, endDate)}
    )
    select count(*) filter (where visited)::int as sessions,
      count(*) filter (where visited and viewed_product)::int as product_sessions,
      count(*) filter (where visited and viewed_product and added_to_cart)::int as cart_sessions,
      count(*) filter (
        where visited and viewed_product and added_to_cart and began_checkout
      )::int as checkout_sessions,
      count(*) filter (
        where visited and viewed_product and added_to_cart and began_checkout
          and submitted_sessions.session_id is not null
      )::int as submitted_sessions
    from session_stages
    left join submitted_sessions using (session_id)
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return [
    { name: 'Sessions', value: numeric(row.sessions) },
    { name: 'Product-view sessions', value: numeric(row.product_sessions) },
    { name: 'Cart sessions', value: numeric(row.cart_sessions) },
    { name: 'Checkout sessions', value: numeric(row.checkout_sessions) },
    { name: 'Submitted-order sessions', value: numeric(row.submitted_sessions) },
  ].filter((stage) => stage.value > 0);
}
