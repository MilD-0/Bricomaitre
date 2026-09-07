import {
  analyticsEvents,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import {
  ORDER_ACQUISITION_SEMANTICS_VERSION,
  ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
} from '../marketing-contracts';
import {
  ANALYTICS_RAW_RETENTION_DAYS,
  type Database,
  PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS,
  STOREFRONT_MAINTENANCE_BATCH_SIZE,
  daysBefore,
  deletedCount,
} from './policy';

export async function rollUpNextExpiredPaidClickDay(db: Database, { now = new Date() } = {}) {
  const cutoff = daysBefore(now, ANALYTICS_RAW_RETENTION_DAYS);
  const dayResult = await db.execute(sql`
    select (${analyticsPaidClickVisits.firstSeenAt} at time zone 'Africa/Algiers')::date::text as day
    from ${analyticsPaidClickVisits}
    where ${analyticsPaidClickVisits.firstSeenAt} < ${cutoff}
      and not exists (
        select 1 from ${analyticsPaidClickDailyRollups} rollup
        where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone rollup.day_timezone)::date
      )
    order by (${analyticsPaidClickVisits.firstSeenAt} at time zone 'Africa/Algiers')::date asc
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
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, updated_at, day_timezone
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
      now(), 'Africa/Algiers'
    from ${analyticsPaidClickVisits} visits
    left join flags on flags.visit_id = visits.visit_id
    left join order_flags on order_flags.visit_id = visits.visit_id
    where visits.first_seen_at >= (${day}::date::timestamp at time zone 'Africa/Algiers')
      and visits.first_seen_at < ((${day}::date + 1)::timestamp at time zone 'Africa/Algiers')
      and not exists (select 1 from ${analyticsPaidClickDailyRollups} legacy
        where legacy.day_timezone = 'UTC' and legacy.day = (visits.first_seen_at at time zone 'UTC')::date)
    group by 2, 3, 4, 5
    on conflict (day, variant, paid_source, has_order, landing_path, day_timezone) do nothing
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
      select day, day_timezone, variant, paid_source, has_order,
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
      group by 1, 2, 3, 4, 5, 6
    )
    insert into ${analyticsPaidClickDailyRollups} (
      day, day_timezone, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, updated_at
    )
    select day, day_timezone, variant, paid_source, has_order, landing_path, visits, landed_only,
      viewed_product, added_to_cart, began_checkout, created_order, purchased, errored, now()
    from aggregated
    on conflict (day, variant, paid_source, has_order, landing_path, day_timezone) do update set
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
          where rollup.day = (${analyticsPaidClickVisits.firstSeenAt} at time zone rollup.day_timezone)::date
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
