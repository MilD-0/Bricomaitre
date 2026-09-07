import {
  analyticsEvents,
  marketingEventOutbox,
  metaEventDailyRollups,
  metaEventOutbox,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import {
  type Database,
  daysBefore,
  deletedCount,
  MARKETING_ACCEPTED_RETENTION_DAYS,
  MARKETING_FAILED_RETENTION_DAYS,
  META_DELIVERED_RETENTION_DAYS,
  META_FAILED_RETENTION_DAYS,
  STOREFRONT_MAINTENANCE_BATCH_SIZE,
} from './policy';

export async function rollUpNextExpiredMetaOutboxDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, META_DELIVERED_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${metaEventOutbox.eventTime} at time zone 'Africa/Algiers')::date::text as day
    from ${metaEventOutbox}
    where ${metaEventOutbox.eventTime} < ${cutoff}
      and ${metaEventOutbox.status} in ('delivered', 'failed', 'skipped')
      and not exists (
        select 1 from ${metaEventDailyRollups} rollup
        where rollup.day = (${metaEventOutbox.eventTime} at time zone rollup.day_timezone)::date
      )
      and not exists (
        select 1 from ${metaEventOutbox} active
        where (active.event_time at time zone 'Africa/Algiers')::date = (${metaEventOutbox.eventTime} at time zone 'Africa/Algiers')::date
          and active.status in ('pending', 'retryable', 'processing')
      )
    order by (${metaEventOutbox.eventTime} at time zone 'Africa/Algiers')::date asc
    limit 1
  `);
  const day = (dayResult.rows[0] as { day?: string } | undefined)?.day;
  if (!day) {
    return null;
  }

  await db.execute(sql`
    insert into ${metaEventDailyRollups} (
      day, event_name, total, pixel_fired, capi_sent, delivered, failed, skipped,
      last_occurred_at, updated_at, day_timezone
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
      now(), 'Africa/Algiers'
    from ${metaEventOutbox} outbox
    left join ${analyticsEvents} events on events.event_id = outbox.event_id
    where outbox.event_time >= (${day}::date::timestamp at time zone 'Africa/Algiers')
      and outbox.event_time < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
      and not exists (select 1 from ${metaEventDailyRollups} legacy
        where legacy.day_timezone = 'UTC' and legacy.day = (outbox.event_time at time zone 'UTC')::date)
    group by outbox.event_name
    on conflict (day, event_name, day_timezone) do nothing
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
        where rollup.day = (${metaEventOutbox.eventTime} at time zone rollup.day_timezone)::date
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
