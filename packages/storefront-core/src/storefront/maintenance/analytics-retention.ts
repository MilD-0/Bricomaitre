import {
  analyticsAcquisitionDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsJourneys,
  analyticsSessions,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import {
  ANALYTICS_ERROR_RETENTION_DAYS,
  ANALYTICS_RAW_RETENTION_DAYS,
  type Database,
  STOREFRONT_MAINTENANCE_BATCH_SIZE,
  daysBefore,
  deletedCount,
} from './policy';

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
        and ${analyticsEvents.eventName} not in (
          'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
          'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
        )
        and exists (
          select 1 from ${analyticsDailyRollups} rollup
          where rollup.day = (${analyticsEvents.occurredAt} at time zone rollup.day_timezone)::date
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

export async function deleteExpiredAnalyticsSessionsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const result = await db.execute(sql`
    with expired as (
      select ${analyticsSessions.id}
      from ${analyticsSessions}
      where ${analyticsSessions.lastSeenAt} < ${cutoff}
        and not exists (
          select 1 from ${analyticsEvents}
          where ${analyticsEvents.sessionId} = ${analyticsSessions.id}
            and ${analyticsEvents.eventName} in (
              'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
              'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
            )
        )
        and exists (
          select 1 from ${analyticsAcquisitionDailyRollups} rollup
          where rollup.day = (${analyticsSessions.startedAt} at time zone rollup.day_timezone)::date
            and rollup.channel = ${analyticsSessions.channel}
            and rollup.evidence = ${analyticsSessions.evidence}
        )
      order by ${analyticsSessions.lastSeenAt} asc, ${analyticsSessions.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${analyticsSessions} sessions
    using expired
    where sessions.id = expired.id
    returning sessions.id
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

export async function deleteUnusedAnalyticsMembersBatch(
  db: Database,
  { limit = STOREFRONT_MAINTENANCE_BATCH_SIZE }: { limit?: number } = {},
) {
  const result = await db.execute(sql`
    with unused as (
      select id from ${analyticsDistinctDailyMembers}
      where metric in ('journey', 'session')
      order by id limit ${Math.max(1, limit)} for update skip locked
    )
    delete from ${analyticsDistinctDailyMembers} members using unused
    where members.id = unused.id returning members.id
  `);
  return deletedCount(result);
}
