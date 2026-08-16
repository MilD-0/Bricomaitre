import { sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsEvents,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsJourneys,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  marketingEventOutbox,
  metaEventDailyRollups,
  metaEventOutbox,
  storefrontOrderIdempotency,
} from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export const ANALYTICS_RAW_RETENTION_DAYS = 7;
export const ANALYTICS_ERROR_RETENTION_DAYS = 30;
export const META_DELIVERED_RETENTION_DAYS = 7;
export const META_FAILED_RETENTION_DAYS = 30;
export const MARKETING_ACCEPTED_RETENTION_DAYS = 7;
export const MARKETING_FAILED_RETENTION_DAYS = 30;
export const STOREFRONT_MAINTENANCE_BATCH_SIZE = 5_000;

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function deletedCount(result: { rows?: unknown[] }) {
  return result.rows?.length ?? 0;
}

export async function deleteExpiredOrderIdempotencyBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const result = await db.execute(sql`
    with expired as (
      select ${storefrontOrderIdempotency.keyHash}
      from ${storefrontOrderIdempotency}
      where ${storefrontOrderIdempotency.expiresAt} < ${now}
      order by ${storefrontOrderIdempotency.expiresAt} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${storefrontOrderIdempotency} records
    using expired
    where records.key_hash = expired.key_hash
    returning records.key_hash
  `);
  return deletedCount(result);
}

export async function rollUpNextExpiredAnalyticsDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${analyticsEvents.occurredAt} at time zone 'UTC')::date::text as day
    from ${analyticsEvents}
    where ${analyticsEvents.occurredAt} < ${cutoff}
      and not exists (
        select 1 from ${analyticsDailyRollups} rollup
        where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
          and rollup.dimension = 'overall'
          and rollup.dimension_key = ''
      )
    order by (${analyticsEvents.occurredAt} at time zone 'UTC')::date asc
    limit 1
  `);
  const day = (dayResult.rows[0] as { day?: string } | undefined)?.day;
  if (!day) {
    return null;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into ${analyticsDistinctDailyMembers} (day, metric, dimension_key, member_id)
      select ${day}::date, metric, dimension_key, member_id
      from (
        select distinct 'journey'::text as metric, ''::text as dimension_key, journey_id as member_id
        from ${analyticsEvents}
        where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
          and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        union all
        select distinct 'session', '', session_id
        from ${analyticsEvents}
        where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
          and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
          and event_name = 'page_view'
      ) members
      on conflict (day, metric, dimension_key, member_id) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, sessions, journeys, page_views, product_views,
        add_to_carts, checkout_starts, purchases, searches, zero_result_searches, updated_at
      )
      select
        ${day}::date, 'overall', '',
        count(distinct session_id) filter (where event_name = 'page_view')::int,
        count(distinct journey_id)::int,
        count(*) filter (where event_name = 'page_view')::int,
        count(*) filter (where event_name = 'view_item')::int,
        count(*) filter (where event_name = 'add_to_cart')::int,
        count(*) filter (where event_name = 'begin_checkout')::int,
        count(*) filter (where event_name = 'purchase')::int,
        count(*) filter (where event_name = 'search')::int,
        count(*) filter (
          where event_name = 'search'
            and case
              when coalesce(metadata->>'resultsCount', '') ~ '^-?[0-9]+$'
                then (metadata->>'resultsCount')::int
              else null
            end = 0
        )::int,
        now()
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'UTC')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'UTC')
      on conflict (day, dimension, dimension_key) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, searches, zero_result_searches, updated_at
      )
      select
        ${day}::date, 'search', coalesce(nullif(search_term, ''), 'Unknown'), count(*)::int,
        count(*) filter (
          where case
            when coalesce(metadata->>'resultsCount', '') ~ '^-?[0-9]+$'
              then (metadata->>'resultsCount')::int
            else null
          end = 0
        )::int,
        now()
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'UTC')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and event_name = 'search'
      group by 3
      on conflict (day, dimension, dimension_key) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, product_views, add_to_carts,
        checkout_starts, purchases, updated_at
      )
      select
        ${day}::date,
        'product',
        product_id::text,
        count(*) filter (where event_name = 'view_item')::int,
        count(*) filter (where event_name = 'add_to_cart')::int,
        count(*) filter (where event_name = 'begin_checkout')::int,
        count(*) filter (where event_name = 'purchase')::int,
        now()
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'UTC')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and ${analyticsEvents.productId} is not null
        and ${analyticsEvents.eventName} in ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')
      group by 3
      on conflict (day, dimension, dimension_key) do nothing
    `);
  });

  return day;
}

export async function rollUpNextExpiredPaidClickDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date::text as day
    from ${analyticsPaidClickVisits}
    where ${analyticsPaidClickVisits.firstSeenAt} < ${cutoff}
      and not exists (
        select 1 from ${analyticsPaidClickDailyRollups} rollup
        where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date
      )
    order by (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date asc
    limit 1
  `);
  const day = (dayResult.rows[0] as { day?: string } | undefined)?.day;
  if (!day) return null;

  await db.execute(sql`
    with flags as (
      select visit_id,
        bool_or(event_name = 'view_item') as viewed,
        bool_or(event_name = 'add_to_cart') as carted,
        bool_or(event_name in ('begin_checkout', 'checkout_view')) as checkout,
        bool_or(event_name = 'api_error') as errored
      from ${analyticsEvents}
      where visit_id is not null
      group by visit_id
    )
    insert into ${analyticsPaidClickDailyRollups} (
      day, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, updated_at
    )
    select ${day}::date,
      'storefront',
      visits.paid_source,
      case when visits.order_id is null then 0 else 1 end,
      visits.landing_path,
      count(*)::int,
      count(*) filter (where not coalesce(flags.viewed, false) and not coalesce(flags.carted, false)
        and not coalesce(flags.checkout, false) and visits.order_id is null and visits.purchase_count = 0
        and not coalesce(flags.errored, false))::int,
      count(*) filter (where coalesce(flags.viewed, false) and not coalesce(flags.carted, false)
        and not coalesce(flags.checkout, false) and visits.order_id is null and visits.purchase_count = 0)::int,
      count(*) filter (where coalesce(flags.carted, false) and not coalesce(flags.checkout, false)
        and visits.order_id is null and visits.purchase_count = 0)::int,
      count(*) filter (where coalesce(flags.checkout, false) and visits.order_id is null
        and visits.purchase_count = 0)::int,
      count(*) filter (where visits.order_id is not null and visits.purchase_count = 0)::int,
      count(*) filter (where visits.purchase_count > 0)::int,
      count(*) filter (where coalesce(flags.errored, false))::int,
      now()
    from ${analyticsPaidClickVisits} visits
    left join flags on flags.visit_id = visits.visit_id
    where visits.first_seen_at >= (${day}::date::timestamp at time zone 'UTC')
      and visits.first_seen_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
    group by 2, 3, 4, 5
    on conflict (day, variant, paid_source, has_order, landing_path) do nothing
  `);
  return day;
}

export async function deleteExpiredPaidClickVisitsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const result = await db.execute(sql`
    with expired as (
      select ${analyticsPaidClickVisits.visitId}
      from ${analyticsPaidClickVisits}
      where ${analyticsPaidClickVisits.firstSeenAt} < ${daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS)}
        and exists (
          select 1 from ${analyticsPaidClickDailyRollups} rollup
          where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone 'UTC')::date
        )
      order by ${analyticsPaidClickVisits.firstSeenAt} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${analyticsPaidClickVisits} visits
    using expired
    where visits.visit_id = expired.visit_id
    returning visits.visit_id
  `);
  return deletedCount(result);
}

export async function rollUpNextExpiredMetaOutboxDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, META_DELIVERED_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${metaEventOutbox.eventTime} at time zone 'UTC')::date::text as day
    from ${metaEventOutbox}
    where ${metaEventOutbox.eventTime} < ${cutoff}
      and ${metaEventOutbox.status} in ('delivered', 'failed', 'skipped')
      and not exists (
        select 1 from ${metaEventDailyRollups} rollup
        where rollup.day = (${metaEventOutbox.eventTime} at time zone 'UTC')::date
      )
      and not exists (
        select 1 from ${metaEventOutbox} active
        where (active.event_time at time zone 'UTC')::date = (${metaEventOutbox.eventTime} at time zone 'UTC')::date
          and active.status in ('pending', 'retryable', 'processing')
      )
    order by (${metaEventOutbox.eventTime} at time zone 'UTC')::date asc
    limit 1
  `);
  const day = (dayResult.rows[0] as { day?: string } | undefined)?.day;
  if (!day) {
    return null;
  }

  await db.execute(sql`
    insert into ${metaEventDailyRollups} (
      day, event_name, total, pixel_fired, capi_sent, delivered, failed, skipped,
      last_occurred_at, updated_at
    )
    select
      ${day}::date,
      outbox.event_name,
      count(*)::int,
      count(*) filter (
        where coalesce(events.metadata->'metaTracking'->'pixel'->>'invoked', 'false') = 'true'
      )::int,
      count(*) filter (where outbox.attempt_count > 0)::int,
      count(*) filter (where outbox.status = 'delivered')::int,
      count(*) filter (where outbox.status = 'failed')::int,
      count(*) filter (where outbox.status = 'skipped')::int,
      max(outbox.event_time),
      now()
    from ${metaEventOutbox} outbox
    left join ${analyticsEvents} events on events.event_id = outbox.event_id
    where outbox.event_time >= (${day}::date::timestamp at time zone 'UTC')
      and outbox.event_time < ((${day}::date + 1)::timestamp at time zone 'UTC')
    group by outbox.event_name
    on conflict (day, event_name) do nothing
  `);

  return day;
}

export async function deleteTerminalMetaOutboxBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const deliveredCutoff = daysBefore(now, META_DELIVERED_RETENTION_DAYS);
  const failedCutoff = daysBefore(now, META_FAILED_RETENTION_DAYS);
  const result = await db.execute(sql`
    with terminal as (
      select ${metaEventOutbox.id}
      from ${metaEventOutbox}
      where (
        (
          ${metaEventOutbox.status} = 'delivered'
          and coalesce(${metaEventOutbox.deliveredAt}, ${metaEventOutbox.updatedAt}) < ${deliveredCutoff}
        ) or (
          ${metaEventOutbox.status} in ('failed', 'skipped')
          and ${metaEventOutbox.updatedAt} < ${failedCutoff}
        )
      )
      and exists (
        select 1 from ${metaEventDailyRollups} rollup
        where rollup.day = (${metaEventOutbox.eventTime} at time zone 'UTC')::date
      )
      order by ${metaEventOutbox.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${metaEventOutbox} outbox
    using terminal
    where outbox.id = terminal.id
    returning outbox.id
  `);
  return deletedCount(result);
}

export async function deleteTerminalMarketingOutboxBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const acceptedCutoff = daysBefore(now, MARKETING_ACCEPTED_RETENTION_DAYS);
  const failedCutoff = daysBefore(now, MARKETING_FAILED_RETENTION_DAYS);
  const result = await db.execute(sql`
    with terminal as (
      select ${marketingEventOutbox.id}
      from ${marketingEventOutbox}
      where (
        (
          ${marketingEventOutbox.status} = 'accepted'
          and coalesce(
            ${marketingEventOutbox.deliveredAt},
            ${marketingEventOutbox.updatedAt},
            ${marketingEventOutbox.createdAt}
          ) < ${acceptedCutoff}
        ) or (
          ${marketingEventOutbox.status} in ('rejected', 'exhausted', 'dropped')
          and ${marketingEventOutbox.updatedAt} < ${failedCutoff}
        )
      )
      order by ${marketingEventOutbox.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${marketingEventOutbox} outbox
    using terminal
    where outbox.id = terminal.id
    returning outbox.id
  `);
  return deletedCount(result);
}

export async function compactRetainedMetaErrorsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const rawCutoff = daysBefore(now, META_DELIVERED_RETENTION_DAYS);
  const errorCutoff = daysBefore(now, META_FAILED_RETENTION_DAYS);
  const result = await db.execute(sql`
    with retained as (
      select ${metaEventOutbox.id}
      from ${metaEventOutbox}
      where ${metaEventOutbox.status} in ('failed', 'skipped')
        and ${metaEventOutbox.updatedAt} < ${rawCutoff}
        and ${metaEventOutbox.updatedAt} >= ${errorCutoff}
        and (${metaEventOutbox.userData} <> '{}'::jsonb
          or ${metaEventOutbox.customData} <> '{}'::jsonb
          or ${metaEventOutbox.matchKeySummary} <> '[]'::jsonb)
      order by ${metaEventOutbox.updatedAt} asc, ${metaEventOutbox.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    update ${metaEventOutbox} outbox
    set user_data = '{}'::jsonb, custom_data = '{}'::jsonb, match_key_summary = '[]'::jsonb
    from retained
    where outbox.id = retained.id
    returning outbox.id
  `);
  return deletedCount(result);
}

export async function compactRetainedAnalyticsErrorsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const rawCutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const errorCutoff = daysBefore(now, ANALYTICS_ERROR_RETENTION_DAYS);
  const result = await db.execute(sql`
    with retained as (
      select ${analyticsEvents.id}
      from ${analyticsEvents}
      where ${analyticsEvents.eventName} in ('api_error', 'order_create_failed')
        and ${analyticsEvents.occurredAt} < ${rawCutoff}
        and ${analyticsEvents.occurredAt} >= ${errorCutoff}
        and not (${analyticsEvents.metadata} @> '{"retainedError":true}'::jsonb)
      order by ${analyticsEvents.occurredAt} asc, ${analyticsEvents.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    update ${analyticsEvents} events
    set metadata = jsonb_strip_nulls(jsonb_build_object(
          'retainedError', true,
          'kind', events.metadata->'kind',
          'status', events.metadata->'status',
          'code', events.metadata->'code',
          'message', events.metadata->'message'
        )),
        referrer = null, utm_source = null, utm_medium = null, utm_campaign = null,
        utm_term = null, utm_content = null, product_id = null, product_slug = null,
        category_id = null, category_slug = null, brand_id = null, brand_slug = null,
        search_term = null, quantity = null, value = null
    from retained
    where events.id = retained.id
    returning events.id
  `);
  return deletedCount(result);
}

export async function deleteExpiredAnalyticsEventsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const errorCutoff = daysBefore(now, ANALYTICS_ERROR_RETENTION_DAYS);
  const result = await db.execute(sql`
    with expired as (
      select ${analyticsEvents.id}
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} < case
          when ${analyticsEvents.eventName} in ('api_error', 'order_create_failed')
            then ${errorCutoff}::timestamptz
          else ${cutoff}::timestamptz
        end
        and exists (
          select 1 from ${analyticsDailyRollups} rollup
          where rollup.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
            and rollup.dimension = 'overall'
            and rollup.dimension_key = ''
        )
      order by ${analyticsEvents.occurredAt} asc, ${analyticsEvents.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${analyticsEvents} events
    using expired
    where events.id = expired.id
    returning events.id
  `);
  return deletedCount(result);
}

export async function deleteInactiveAnalyticsJourneysBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const result = await db.execute(sql`
    with inactive as (
      select ${analyticsJourneys.id}
      from ${analyticsJourneys}
      where ${analyticsJourneys.lastSeenAt} < ${cutoff}
        and not exists (
          select 1 from ${analyticsEvents}
          where ${analyticsEvents.journeyId} = ${analyticsJourneys.id}
        )
      order by ${analyticsJourneys.lastSeenAt} asc, ${analyticsJourneys.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${analyticsJourneys} journeys
    using inactive
    where journeys.id = inactive.id
    returning journeys.id
  `);
  return deletedCount(result);
}

export async function compactRetainedAnalyticsJourneysBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const result = await db.execute(sql`
    with retained as (
      select ${analyticsJourneys.id}
      from ${analyticsJourneys}
      where ${analyticsJourneys.lastSeenAt} < ${cutoff}
        and exists (
          select 1 from ${analyticsEvents}
          where ${analyticsEvents.journeyId} = ${analyticsJourneys.id}
            and ${analyticsEvents.eventName} in ('api_error', 'order_create_failed')
        )
        and not exists (
          select 1 from ${analyticsEvents}
          where ${analyticsEvents.journeyId} = ${analyticsJourneys.id}
            and ${analyticsEvents.eventName} not in ('api_error', 'order_create_failed')
        )
        and (
          ${analyticsJourneys.firstPath} is not null or ${analyticsJourneys.lastPath} is not null
          or ${analyticsJourneys.locale} is not null or ${analyticsJourneys.referrer} is not null
          or ${analyticsJourneys.utmSource} is not null or ${analyticsJourneys.utmMedium} is not null
          or ${analyticsJourneys.utmCampaign} is not null or ${analyticsJourneys.utmTerm} is not null
          or ${analyticsJourneys.utmContent} is not null or ${analyticsJourneys.orderCount} <> 0
          or ${analyticsJourneys.purchaseCount} <> 0 or ${analyticsJourneys.firstOrderId} is not null
        )
      order by ${analyticsJourneys.lastSeenAt} asc, ${analyticsJourneys.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    update ${analyticsJourneys} journeys
    set first_path = null, last_path = null, locale = null, referrer = null,
        utm_source = null, utm_medium = null, utm_campaign = null,
        utm_term = null, utm_content = null, order_count = 0,
        purchase_count = 0, first_order_id = null
    from retained
    where journeys.id = retained.id
    returning journeys.id
  `);
  return deletedCount(result);
}

export async function runStorefrontDataMaintenanceBatch(
  db: Database,
  options: { now?: Date; limit?: number } = {},
) {
  const orderIdempotency = await deleteExpiredOrderIdempotencyBatch(db, options);
  const paidClickRolledUpDay = await rollUpNextExpiredPaidClickDay(db, options);
  const paidClicks = await deleteExpiredPaidClickVisitsBatch(db, options);
  const metaRolledUpDay = await rollUpNextExpiredMetaOutboxDay(db, options);
  const metaErrorsCompacted = await compactRetainedMetaErrorsBatch(db, options);
  const metaOutbox = await deleteTerminalMetaOutboxBatch(db, options);
  const marketingOutbox = await deleteTerminalMarketingOutboxBatch(db, options);
  const rolledUpDay = await rollUpNextExpiredAnalyticsDay(db, options);
  const analyticsErrorsCompacted = await compactRetainedAnalyticsErrorsBatch(db, options);
  const analyticsEventsDeleted = await deleteExpiredAnalyticsEventsBatch(db, options);
  const analyticsJourneysCompacted = await compactRetainedAnalyticsJourneysBatch(db, options);
  const analyticsJourneysDeleted = await deleteInactiveAnalyticsJourneysBatch(db, options);

  return {
    orderIdempotency,
    paidClicks,
    paidClickRolledUpDay,
    metaRolledUpDay,
    metaErrorsCompacted,
    metaOutbox,
    marketingOutbox,
    rolledUpDay,
    analyticsErrorsCompacted,
    analyticsEvents: analyticsEventsDeleted,
    analyticsJourneysCompacted,
    analyticsJourneys: analyticsJourneysDeleted,
  };
}
