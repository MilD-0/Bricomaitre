import {
  analyticsAcquisitionDailyRollups,
  analyticsAiDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsSessions,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { analyticsEventProductIdsSql } from '../analytics';
import { ANALYTICS_RAW_RETENTION_DAYS, type Database, daysBefore } from './policy';

export async function rollUpNextExpiredAnalyticsDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date::text as day
    from ${analyticsEvents}
    where ${analyticsEvents.occurredAt} < ${cutoff}
      and not exists (
        select 1 from ${analyticsDailyRollups} rollup
        where rollup.day = (${analyticsEvents.occurredAt} at time zone rollup.day_timezone)::date
          and rollup.dimension = 'overall'
          and rollup.dimension_key = ''
      )
    order by (${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')::date asc
    limit 1
  `);
  const day = (dayResult.rows[0] as { day?: string } | undefined)?.day;
  if (!day) {
    return null;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into ${analyticsDistinctDailyMembers} (day, metric, dimension_key, member_id, day_timezone)
      select ${day}::date, metric, dimension_key, member_id, 'Africa/Algiers'
      from (
        select distinct 'ai_journey'::text as metric, ''::text as dimension_key, journey_id as member_id
        from ${analyticsEvents}
        where occurred_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
          and occurred_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
          and event_name in (
            'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
            'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
          )
      ) members
      on conflict (day, metric, dimension_key, member_id, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, sessions, journeys, page_views, product_views,
        add_to_carts, checkout_starts, purchases, searches, zero_result_searches, updated_at, day_timezone
      )
      select
        ${day}::date, 'overall', '',
        count(distinct session_id) filter (where event_name = 'page_view')::int,
        count(distinct journey_id)::int,
        count(*) filter (where event_name = 'page_view')::int,
        count(*) filter (where event_name = 'view_item')::int,
        count(*) filter (where event_name = 'add_to_cart')::int,
        count(*) filter (where event_name = 'begin_checkout')::int,
        count(distinct coalesce(order_id::text, event_id))
          filter (where event_name = 'purchase')::int,
        count(*) filter (where event_name = 'search')::int,
        count(*) filter (
          where event_name = 'search'
            and case
              when coalesce(metadata->>'resultsCount', '') ~ '^-?[0-9]+$'
                then (metadata->>'resultsCount')::int
              else null
            end = 0
        )::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, searches, zero_result_searches, updated_at, day_timezone
      )
      select
        ${day}::date, 'search', trim(search_term), count(*)::int,
        count(*) filter (
          where case
            when coalesce(metadata->>'resultsCount', '') ~ '^-?[0-9]+$'
              then (metadata->>'resultsCount')::int
            else null
          end = 0
        )::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
        and event_name = 'search'
        and coalesce(trim(search_term), '') <> ''
      group by 3
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsDailyRollups} (
        day, dimension, dimension_key, product_views, add_to_carts,
        checkout_starts, purchases, updated_at, day_timezone
      )
      select
        ${day}::date,
        'product',
        attributed.product_id::text,
        count(*) filter (where event_name = 'view_item')::int,
        count(*) filter (where event_name = 'add_to_cart')::int,
        count(*) filter (where event_name = 'begin_checkout')::int,
        count(distinct coalesce(order_id::text, event_id))
          filter (where event_name = 'purchase')::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      cross join ${analyticsEventProductIdsSql()} attributed
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
        and ${analyticsEvents.eventName} in ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')
      group by 3
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAcquisitionDailyRollups} (
        day, channel, evidence, sessions, updated_at, day_timezone
      )
      select ${day}::date, channel, evidence, count(*)::int, now(), 'Africa/Algiers'
      from ${analyticsSessions}
      where started_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and started_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (select 1 from ${analyticsAcquisitionDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.day = (started_at at time zone 'UTC')::date)
      group by channel, evidence
      on conflict (day, channel, evidence, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, opens, messages, result_clicks, errors,
        runs, completed, failed, cancelled, helpful, not_helpful,
        input_tokens, output_tokens, total_tokens,
        duration_ms_total, duration_samples, tool_calls, updated_at, day_timezone
      )
      select ${day}::date, 'overall', '',
        count(*) filter (where event_name = 'ai_assistant_open')::int,
        count(*) filter (where event_name = 'ai_assistant_message')::int,
        count(*) filter (where event_name = 'ai_assistant_result_click')::int,
        count(*) filter (where event_name = 'ai_assistant_error')::int,
        count(*) filter (where event_name = 'ai_assistant_run')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'failed')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'cancelled')::int,
        count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'helpful')::int,
        count(*) filter (where event_name = 'ai_assistant_feedback' and metadata->>'rating' = 'not_helpful')::int,
        coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$' then (metadata->>'durationMs')::bigint else 0 end), 0)::bigint,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'durationMs' ~ '^[0-9]+$')::int,
        coalesce(sum(case when event_name = 'ai_assistant_run' and metadata->>'toolCalls' ~ '^[0-9]+$' then (metadata->>'toolCalls')::int else 0 end), 0)::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
        and event_name in (
          'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
          'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
        )
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, messages, result_clicks, runs, completed, failed, cancelled,
        input_tokens, output_tokens, total_tokens, duration_ms_total,
        duration_samples, tool_calls, updated_at, day_timezone
      )
      select ${day}::date, 'intent', coalesce(nullif(metadata->>'intent', ''), 'other'),
        count(*) filter (where event_name = 'ai_assistant_message')::int,
        count(*) filter (where event_name = 'ai_assistant_result_click')::int,
        count(*) filter (where event_name = 'ai_assistant_run')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'completed')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'failed')::int,
        count(*) filter (where event_name = 'ai_assistant_run' and metadata->>'status' = 'cancelled')::int,
        coalesce(sum(case when metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'durationMs' ~ '^[0-9]+$' then (metadata->>'durationMs')::bigint else 0 end), 0)::bigint,
        count(*) filter (where metadata->>'durationMs' ~ '^[0-9]+$')::int,
        coalesce(sum(case when metadata->>'toolCalls' ~ '^[0-9]+$' then (metadata->>'toolCalls')::int else 0 end), 0)::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
        and event_name in ('ai_assistant_message', 'ai_assistant_run', 'ai_assistant_result_click')
      group by 3
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, runs, completed, failed, cancelled, input_tokens,
        output_tokens, total_tokens, duration_ms_total, duration_samples, tool_calls, updated_at, day_timezone
      )
      select ${day}::date, 'model', coalesce(nullif(metadata->>'model', ''), 'unknown'),
        count(*)::int,
        count(*) filter (where metadata->>'status' = 'completed')::int,
        count(*) filter (where metadata->>'status' = 'failed')::int,
        count(*) filter (where metadata->>'status' = 'cancelled')::int,
        coalesce(sum(case when metadata->>'inputTokens' ~ '^[0-9]+$' then (metadata->>'inputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'outputTokens' ~ '^[0-9]+$' then (metadata->>'outputTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'totalTokens' ~ '^[0-9]+$' then (metadata->>'totalTokens')::int else 0 end), 0)::int,
        coalesce(sum(case when metadata->>'durationMs' ~ '^[0-9]+$' then (metadata->>'durationMs')::bigint else 0 end), 0)::bigint,
        count(*) filter (where metadata->>'durationMs' ~ '^[0-9]+$')::int,
        coalesce(sum(case when metadata->>'toolCalls' ~ '^[0-9]+$' then (metadata->>'toolCalls')::int else 0 end), 0)::int,
        now(), 'Africa/Algiers'
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
        and not exists (
          select 1 from ${analyticsDailyRollups} legacy
          where legacy.day_timezone = 'UTC' and legacy.dimension = 'overall'
            and legacy.dimension_key = ''
            and legacy.day = (${analyticsEvents.occurredAt} at time zone 'UTC')::date
        )
        and event_name = 'ai_assistant_run'
      group by 3
      on conflict (day, dimension, dimension_key, day_timezone) do nothing
    `);
  });

  return day;
}
