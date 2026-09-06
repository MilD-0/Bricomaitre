import { sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsEvents,
  analyticsAcquisitionDailyRollups,
  analyticsAiDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsJourneys,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  analyticsSessions,
  marketingEventOutbox,
  metaEventDailyRollups,
  metaEventOutbox,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  storefrontOrderIdempotency,
} from '@bric/db/schema';
import {
  ORDER_ACQUISITION_SEMANTICS_VERSION,
  ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
} from './marketing-contracts';

type Database = ReturnType<typeof getDb>;

export const ANALYTICS_RAW_RETENTION_DAYS = 7;
export const ANALYTICS_ERROR_RETENTION_DAYS = 30;
export const META_DELIVERED_RETENTION_DAYS = 7;
export const META_FAILED_RETENTION_DAYS = 30;
export const MARKETING_ACCEPTED_RETENTION_DAYS = 7;
export const MARKETING_FAILED_RETENTION_DAYS = 30;
export const STOREFRONT_MAINTENANCE_BATCH_SIZE = 5_000;
export const PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS = 31;

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
  // A browser can retry a saved request days later. Completed keys live with their orders.
  const result = await db.execute(sql`
    with expired as (
      select ${storefrontOrderIdempotency.keyHash}
      from ${storefrontOrderIdempotency}
      where ${storefrontOrderIdempotency.expiresAt} < ${now}
        and ${storefrontOrderIdempotency.orderId} is null
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
        union all
        select distinct 'ai_journey', '', journey_id
        from ${analyticsEvents}
        where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
          and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
          and event_name in (
            'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
            'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
          )
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
        ${day}::date, 'search', trim(search_term), count(*)::int,
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
        and coalesce(trim(search_term), '') <> ''
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
        count(distinct coalesce(order_id::text, event_id))
          filter (where event_name = 'purchase')::int,
        now()
      from ${analyticsEvents}
      where ${analyticsEvents.occurredAt} >= (${day}::date::timestamp at time zone 'UTC')
        and ${analyticsEvents.occurredAt} < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and ${analyticsEvents.productId} is not null
        and ${analyticsEvents.eventName} in ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')
      group by 3
      on conflict (day, dimension, dimension_key) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAcquisitionDailyRollups} (
        day, channel, evidence, sessions, updated_at
      )
      select ${day}::date, channel, evidence, count(*)::int, now()
      from ${analyticsSessions}
      where started_at >= (${day}::date::timestamp at time zone 'UTC')
        and started_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
      group by channel, evidence
      on conflict (day, channel, evidence) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, opens, messages, result_clicks, errors,
        runs, completed, failed, cancelled, helpful, not_helpful,
        input_tokens, output_tokens, total_tokens,
        duration_ms_total, duration_samples, tool_calls, updated_at
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
        now()
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and event_name in (
          'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
          'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
        )
      on conflict (day, dimension, dimension_key) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, messages, runs, completed, failed, cancelled,
        input_tokens, output_tokens, total_tokens, duration_ms_total,
        duration_samples, tool_calls, updated_at
      )
      select ${day}::date, 'intent', coalesce(nullif(metadata->>'intent', ''), 'other'),
        count(*) filter (where event_name = 'ai_assistant_message')::int,
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
        now()
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and event_name in ('ai_assistant_message', 'ai_assistant_run')
      group by 3
      on conflict (day, dimension, dimension_key) do nothing
    `);

    await tx.execute(sql`
      insert into ${analyticsAiDailyRollups} (
        day, dimension, dimension_key, runs, completed, failed, cancelled, input_tokens,
        output_tokens, total_tokens, duration_ms_total, duration_samples, tool_calls, updated_at
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
        now()
      from ${analyticsEvents}
      where occurred_at >= (${day}::date::timestamp at time zone 'UTC')
        and occurred_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
        and event_name = 'ai_assistant_run'
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
    ), order_flags as (
      select ${orders.visitId} as visit_id, count(*)::int as order_count
      from ${orders}
      where ${orders.visitId} is not null
      group by ${orders.visitId}
    )
    insert into ${analyticsPaidClickDailyRollups} (
      day, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, updated_at
    )
    select ${day}::date,
      'storefront',
      visits.paid_source,
      case when coalesce(order_flags.order_count, 0) = 0 then 0 else 1 end,
      coalesce(nullif(split_part(visits.landing_path, '?', 1), ''), '/'),
      count(*)::int,
      count(*) filter (where not coalesce(flags.viewed, false) and not coalesce(flags.carted, false)
        and not coalesce(flags.checkout, false) and coalesce(order_flags.order_count, 0) = 0 and visits.purchase_count = 0
        and not coalesce(flags.errored, false))::int,
      count(*) filter (where coalesce(flags.viewed, false) and not coalesce(flags.carted, false)
        and not coalesce(flags.checkout, false) and coalesce(order_flags.order_count, 0) = 0 and visits.purchase_count = 0)::int,
      count(*) filter (where coalesce(flags.carted, false) and not coalesce(flags.checkout, false)
        and coalesce(order_flags.order_count, 0) = 0 and visits.purchase_count = 0)::int,
      count(*) filter (where coalesce(flags.checkout, false) and coalesce(order_flags.order_count, 0) = 0
        and visits.purchase_count = 0)::int,
      count(*) filter (where coalesce(order_flags.order_count, 0) > 0 and visits.purchase_count = 0)::int,
      count(*) filter (where visits.purchase_count > 0)::int,
      count(*) filter (where coalesce(flags.errored, false))::int,
      now()
    from ${analyticsPaidClickVisits} visits
    left join flags on flags.visit_id = visits.visit_id
    left join order_flags on order_flags.visit_id = visits.visit_id
    where visits.first_seen_at >= (${day}::date::timestamp at time zone 'UTC')
      and visits.first_seen_at < ((${day}::date + 1)::timestamp at time zone 'UTC')
    group by 2, 3, 4, 5
    on conflict (day, variant, paid_source, has_order, landing_path) do nothing
  `);
  return day;
}

export async function normalizeNextPaidClickRollupDays(db: Database) {
  const result = await db.execute(sql`
    with target as (
      select distinct ${analyticsPaidClickDailyRollups.day} as day
      from ${analyticsPaidClickDailyRollups}
      where position('?' in ${analyticsPaidClickDailyRollups.landingPath}) > 0
      order by ${analyticsPaidClickDailyRollups.day} asc
      limit ${PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS}
    ), deleted as (
      delete from ${analyticsPaidClickDailyRollups} rollups
      using target
      where rollups.day = target.day
        and position('?' in rollups.landing_path) > 0
      returning rollups.*
    ), aggregated as (
      select day, variant, paid_source, has_order,
        coalesce(nullif(split_part(landing_path, '?', 1), ''), '/') as landing_path,
        sum(visits)::int as visits,
        sum(landed_only)::int as landed_only,
        sum(viewed_product)::int as viewed_product,
        sum(added_to_cart)::int as added_to_cart,
        sum(began_checkout)::int as began_checkout,
        sum(created_order)::int as created_order,
        sum(purchased)::int as purchased,
        sum(errored)::int as errored
      from deleted
      group by 1, 2, 3, 4, 5
    )
    insert into ${analyticsPaidClickDailyRollups} (
      day, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, updated_at
    )
    select day, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, now()
    from aggregated
    on conflict (day, variant, paid_source, has_order, landing_path) do update set
      visits = ${analyticsPaidClickDailyRollups.visits} + excluded.visits,
      landed_only = ${analyticsPaidClickDailyRollups.landedOnly} + excluded.landed_only,
      viewed_product = ${analyticsPaidClickDailyRollups.viewedProduct} + excluded.viewed_product,
      added_to_cart = ${analyticsPaidClickDailyRollups.addedToCart} + excluded.added_to_cart,
      began_checkout = ${analyticsPaidClickDailyRollups.beganCheckout} + excluded.began_checkout,
      created_order = ${analyticsPaidClickDailyRollups.createdOrder} + excluded.created_order,
      purchased = ${analyticsPaidClickDailyRollups.purchased} + excluded.purchased,
      errored = ${analyticsPaidClickDailyRollups.errored} + excluded.errored,
      updated_at = now()
    returning day::text as day
  `);
  return [
    ...new Set(
      (result.rows as Array<{ day?: string }>).flatMap((row) => (row.day ? [row.day] : [])),
    ),
  ];
}

export async function backfillOrderAcquisitionAttributionBatch(
  db: Database,
  { limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const result = await db.execute(sql`
    with candidates as (
      select distinct on (${orders.id})
        ${orders.id} as order_id,
        coalesce(nullif(split_part(visits.landing_path, '?', 1), ''), '/') as landing_path,
        lower(nullif(btrim(visits.utm_source), '')) as utm_source,
        lower(nullif(btrim(visits.utm_medium), '')) as utm_medium,
        nullif(btrim(visits.utm_campaign), '') as utm_campaign,
        nullif(btrim(visits.utm_term), '') as utm_term,
        nullif(btrim(visits.utm_content), '') as utm_content,
        lower(nullif(btrim(visits.paid_source), '')) as paid_source,
        visits.session_id as source_session_id,
        visits.first_seen_at as captured_at
      from ${analyticsPaidClickVisits} visits
      inner join ${orders} on ${orders.visitId} = visits.visit_id
        and ${orders.createdAt} >= visits.first_seen_at - interval '5 minutes'
        and ${orders.createdAt} <= visits.first_seen_at + interval '7 days'
      where true
        and not exists (
          select 1 from ${orderAcquisitionAttribution} attribution
          where attribution.order_id = ${orders.id}
        )
      order by ${orders.id}, visits.last_seen_at desc, visits.visit_id desc
      limit ${Math.max(1, limit)}
    ), classified as (
      select candidates.*,
        case
          when utm_source in ('fb', 'facebook', 'ig', 'instagram', 'an', 'audience_network', 'th', 'threads', 'msg', 'messenger', 'meta')
            and coalesce(utm_medium, '') ~ '(cpc|ppc|paid|cpm|cpv)' then 'meta_paid'
          when paid_source = 'meta_utm' then 'meta_paid'
          when utm_source in ('fb', 'facebook', 'ig', 'instagram', 'an', 'audience_network', 'th', 'threads', 'msg', 'messenger', 'meta')
            and coalesce(utm_medium, '') ~ '(organic|social|referral)' then 'meta_organic'
          when paid_source in ('fbclid', 'unknown') then 'meta_unclassified'
          when utm_source in ('google', 'google_ads', 'adwords')
            and coalesce(utm_medium, '') ~ '(cpc|ppc|paid|cpm|cpv)' then 'google_paid'
          when paid_source = 'google_click' then 'google_paid'
          when utm_source in ('google', 'google_ads', 'adwords') then 'google_organic'
          when utm_source is not null or utm_medium is not null then 'other_campaign'
          else 'unknown'
        end as channel
      from candidates
    ), evidenced as (
      select classified.*,
        case
          when channel in ('meta_paid', 'google_paid') and utm_medium is not null then 'paid_utm'
          when channel = 'google_paid' then 'google_click_id'
          when channel = 'meta_unclassified' then 'meta_click_id_only'
          when channel = 'meta_organic' then 'organic_utm'
          when channel = 'google_organic' then 'google_source'
          when channel = 'other_campaign' then 'campaign_utm'
          else 'invalid_referrer'
        end as evidence
      from classified
    )
    insert into ${orderAcquisitionAttribution} (
      order_id, semantics_version, attribution_model, channel, evidence,
      session_channel, session_evidence, source_session_id, session_started_at, landing_path,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      meta_campaign_id, meta_adset_id, meta_ad_id, captured_at, updated_at
    )
    select order_id, ${ORDER_ACQUISITION_SEMANTICS_VERSION},
      'legacy_visit_backfill', channel, evidence, channel, evidence, source_session_id, captured_at,
      landing_path,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      case when channel = 'meta_paid' and utm_campaign ~ '^[0-9]{6,30}$' then utm_campaign end,
      case when channel = 'meta_paid' and utm_term ~ '^[0-9]{6,30}$' then utm_term end,
      case when channel = 'meta_paid' and utm_content ~ '^[0-9]{6,30}$' then utm_content end,
      captured_at, now()
    from evidenced
    on conflict (order_id) do nothing
    returning order_id
  `);
  return deletedCount(result);
}

export async function backfillOrderAiInfluenceBatch(
  db: Database,
  { limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const result = await db.execute(sql`
    with candidates as (
      select ${orders.id} as order_id, ${orders.sessionId} as order_session_id,
        assistant.source_session_id, assistant.opened_at, assistant.engaged_at,
        assistant.recommendation_clicked_at, assistant.clicked_product_ids,
        assistant.captured_at,
        exists (
          select 1 from ${orderLineItems} lines
          where lines.order_id = ${orders.id}
            and lines.product_id = any(assistant.clicked_product_ids)
        ) as recommended_product_ordered
      from ${orders}
      inner join lateral (
        select
          (array_agg(events.session_id order by events.occurred_at desc))[1] as source_session_id,
          min(events.occurred_at) filter (where events.event_name = 'ai_assistant_open') as opened_at,
          min(events.occurred_at) filter (where events.event_name = 'ai_assistant_message') as engaged_at,
          min(events.occurred_at) filter (where events.event_name = 'ai_assistant_result_click') as recommendation_clicked_at,
          coalesce(
            array_agg(distinct events.product_id) filter (
              where events.event_name = 'ai_assistant_result_click' and events.product_id is not null
            ),
            '{}'::bigint[]
          ) as clicked_product_ids,
          max(events.occurred_at) as captured_at
        from ${analyticsEvents} events
        where events.journey_id = ${orders.journeyId}
          and events.occurred_at <= ${orders.createdAt}
          and events.occurred_at >= ${orders.createdAt} - interval '24 hours'
          and events.event_name in (
            'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click'
          )
      ) assistant on assistant.captured_at is not null
      where ${orders.journeyId} is not null
        and not exists (
          select 1 from ${orderAiInfluence} influence
          where influence.order_id = ${orders.id}
        )
      order by ${orders.id} asc
      limit ${Math.max(1, limit)}
    )
    insert into ${orderAiInfluence} (
      order_id, semantics_version, level, same_session, source_session_id,
      opened_at, engaged_at, recommendation_clicked_at, clicked_product_ids,
      recommended_product_ordered, captured_at, updated_at
    )
    select order_id, ${`${ORDER_AI_INFLUENCE_SEMANTICS_VERSION}_legacy_event_backfill`},
      case
        when recommended_product_ordered then 'recommended_product_ordered'
        when recommendation_clicked_at is not null then 'recommendation_clicked'
        when engaged_at is not null then 'engaged'
        else 'opened'
      end,
      coalesce(source_session_id = order_session_id, false), source_session_id,
      opened_at, engaged_at, recommendation_clicked_at, to_jsonb(clicked_product_ids),
      recommended_product_ordered, captured_at, now()
    from candidates
    on conflict (order_id) do nothing
    returning order_id
  `);
  return deletedCount(result);
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
        and not exists (
          select 1 from ${orders}
          where ${orders.visitId} = ${analyticsPaidClickVisits.visitId}
            and not exists (
              select 1 from ${orderAcquisitionAttribution} attribution
              where attribution.order_id = ${orders.id}
            )
        )
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
        and ${analyticsEvents.eventName} not in (
          'ai_assistant_open', 'ai_assistant_message', 'ai_assistant_result_click',
          'ai_assistant_feedback', 'ai_assistant_error', 'ai_assistant_run'
        )
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
          where rollup.day = (${analyticsSessions.startedAt} at time zone 'UTC')::date
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

export async function runStorefrontDataMaintenanceBatch(
  db: Database,
  options: { now?: Date; limit?: number } = {},
) {
  const orderIdempotency = await deleteExpiredOrderIdempotencyBatch(db, options);
  const orderAcquisitionBackfilled = await backfillOrderAcquisitionAttributionBatch(db, options);
  const orderAiInfluenceBackfilled = await backfillOrderAiInfluenceBatch(db, options);
  const paidClickNormalizedDays = await normalizeNextPaidClickRollupDays(db);
  const paidClickRolledUpDay = await rollUpNextExpiredPaidClickDay(db, options);
  const paidClicks = await deleteExpiredPaidClickVisitsBatch(db, options);
  const metaRolledUpDay = await rollUpNextExpiredMetaOutboxDay(db, options);
  const metaErrorsCompacted = await compactRetainedMetaErrorsBatch(db, options);
  const metaOutbox = await deleteTerminalMetaOutboxBatch(db, options);
  const marketingOutbox = await deleteTerminalMarketingOutboxBatch(db, options);
  const rolledUpDay = await rollUpNextExpiredAnalyticsDay(db, options);
  const analyticsErrorsCompacted = await compactRetainedAnalyticsErrorsBatch(db, options);
  const analyticsEventsDeleted = await deleteExpiredAnalyticsEventsBatch(db, options);
  const analyticsSessionsDeleted = await deleteExpiredAnalyticsSessionsBatch(db, options);
  const analyticsJourneysCompacted = await compactRetainedAnalyticsJourneysBatch(db, options);
  const analyticsJourneysDeleted = await deleteInactiveAnalyticsJourneysBatch(db, options);

  return {
    orderIdempotency,
    orderAcquisitionBackfilled,
    orderAiInfluenceBackfilled,
    paidClickNormalizedDays,
    paidClicks,
    paidClickRolledUpDay,
    metaRolledUpDay,
    metaErrorsCompacted,
    metaOutbox,
    marketingOutbox,
    rolledUpDay,
    analyticsErrorsCompacted,
    analyticsEvents: analyticsEventsDeleted,
    analyticsSessions: analyticsSessionsDeleted,
    analyticsJourneysCompacted,
    analyticsJourneys: analyticsJourneysDeleted,
  };
}
