CREATE TEMP TABLE historical_daily_traffic AS
WITH days AS (
  SELECT day::date AS day,
    row_number() OVER (ORDER BY day)::integer AS day_number,
    count(*) OVER ()::integer AS day_count
  FROM demo_runtime.timeline timeline
  CROSS JOIN LATERAL generate_series(
    timeline.history_start,
    timeline.history_end,
    interval '1 day'
  ) day
), weighted AS (
  SELECT *, greatest(0.2,
    0.55
      + 0.9 * (day_number - 1)::double precision / greatest(day_count - 1, 1)
      + 0.09 * sin(day_number * pi() / 3.5)
      + 0.08 * sin(extract(doy FROM day) * 2 * pi() / 365.25)
      + CASE WHEN extract(month FROM day) IN (3, 9, 11) THEN 0.11 ELSE 0 END
  ) AS weight
  FROM days
), normalized AS (
  SELECT *, 12000000 * weight / sum(weight) OVER () AS exact_sessions
  FROM weighted
), floored AS (
  SELECT *, floor(exact_sessions)::integer AS base_sessions
  FROM normalized
), apportioned AS (
  SELECT *, 12000000 - sum(base_sessions) OVER ()::integer AS remainder,
    row_number() OVER (
      ORDER BY exact_sessions - base_sessions DESC, day
    ) AS remainder_rank
  FROM floored
)
SELECT day,
  base_sessions + CASE WHEN remainder_rank <= remainder THEN 1 ELSE 0 END AS sessions
FROM apportioned;

INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, sessions, journeys, page_views,
  product_views, add_to_carts, checkout_starts, purchases, searches,
  zero_result_searches, created_at, updated_at
)
SELECT day, 'overall', '', sessions,
  round(sessions * (0.86 + 0.02 * sin(extract(doy FROM day) * pi() / 31)))::integer,
  round(sessions * (2.35 + 0.12 * sin(extract(dow FROM day) * pi() / 3.5)))::integer,
  round(sessions * (1.04 + 0.08 * sin(extract(doy FROM day) * pi() / 47)))::integer,
  round(sessions * (0.142 + 0.012 * sin(extract(doy FROM day) * pi() / 23)))::integer,
  round(sessions * (0.071 + 0.006 * sin(extract(doy FROM day) * pi() / 29)))::integer,
  round(sessions * (0.0208 + 0.0018 * sin(extract(doy FROM day) * pi() / 19)))::integer,
  round(sessions * (0.19 + 0.018 * sin(extract(doy FROM day) * pi() / 17)))::integer,
  round(sessions * (0.011 + 0.002 * sin(extract(doy FROM day) * pi() / 13)))::integer,
  day::timestamptz + interval '1 day', day::timestamptz + interval '1 day'
FROM historical_daily_traffic;

INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, searches, zero_result_searches, created_at, updated_at
)
SELECT overall.day, 'search', term,
  round(overall.searches * demand_share)::integer,
  CASE WHEN can_miss THEN 1 + mod(extract(doy FROM overall.day)::integer, 3) ELSE 0 END,
  overall.day::timestamptz + interval '1 day', overall.day::timestamptz + interval '1 day'
FROM analytics_daily_rollups overall
CROSS JOIN (VALUES
  ('perceuse sans fil', 0.18, false),
  ('meuleuse 125 mm', 0.14, false),
  ('caisse à outils', 0.12, false),
  ('multimètre numérique', 0.11, false),
  ('robinet cuisine', 0.09, false),
  ('gants de travail', 0.08, false),
  ('lame scie circulaire', 0.07, false),
  ('tuyau arrosage', 0.06, false),
  ('clé à cliquet', 0.05, false),
  ('poste à souder', 0.04, true),
  ('مصباح ورشة', 0.035, true),
  ('مثقاب لاسلكي', 0.025, true)
) terms(term, demand_share, can_miss)
WHERE overall.dimension = 'overall';

INSERT INTO analytics_acquisition_daily_rollups (
  day, channel, evidence, sessions, created_at, updated_at
)
SELECT overall.day, channel, evidence,
  CASE channel
    WHEN 'meta_paid' THEN round(overall.sessions * 0.38)
    WHEN 'google_organic' THEN round(overall.sessions * 0.26)
    WHEN 'direct_dark_social' THEN round(overall.sessions * 0.21)
    WHEN 'other_referral' THEN round(overall.sessions * 0.09)
    ELSE overall.sessions - round(overall.sessions * 0.94) END,
  overall.day::timestamptz + interval '1 day', overall.day::timestamptz + interval '1 day'
FROM analytics_daily_rollups overall
CROSS JOIN (VALUES
  ('meta_paid', 'paid_utm'), ('google_organic', 'google_source'),
  ('direct_dark_social', 'no_external_referrer'),
  ('other_referral', 'external_referrer'), ('google_paid', 'paid_utm')
) acquisition(channel, evidence)
WHERE overall.dimension = 'overall';

WITH boundary AS (
  SELECT date_trunc('month', history_end - interval '120 days')::date AS recent_start
  FROM demo_runtime.timeline
), periods AS (
  SELECT date_trunc('month', overall.day)::date AS day,
    sum(overall.product_views)::bigint product_views,
    sum(overall.add_to_carts)::bigint add_to_carts,
    sum(overall.checkout_starts)::bigint checkout_starts
  FROM analytics_daily_rollups overall CROSS JOIN boundary
  WHERE overall.dimension = 'overall' AND overall.day < boundary.recent_start
  GROUP BY 1
  UNION ALL
  SELECT overall.day, overall.product_views, overall.add_to_carts,
    overall.checkout_starts
  FROM analytics_daily_rollups overall CROSS JOIN boundary
  WHERE overall.dimension = 'overall' AND overall.day >= boundary.recent_start
), ranked_products AS (
  SELECT id, row_number() OVER (
    ORDER BY coalesce((
      SELECT merchandise.sort_order
      FROM demo_runtime.merchandise_products merchandise
      WHERE merchandise.placement = 'top'
        AND merchandise.product_key = products.mongo_id
    ), 1000), hashtextextended(mongo_id, 41) DESC, id
  ) AS product_number
  FROM products
), purchases AS (
  SELECT CASE WHEN orders.created_at::date < boundary.recent_start
      THEN date_trunc('month', orders.created_at)::date
      ELSE orders.created_at::date END AS day,
    line.product_id, count(DISTINCT orders.id)::integer purchases
  FROM order_line_items line
  JOIN orders ON orders.id = line.order_id
  CROSS JOIN boundary
  WHERE line.product_id IS NOT NULL
  GROUP BY 1, 2
), distribution AS (
  SELECT periods.*, product.id, product.product_number,
    coalesce(purchases.purchases, 0) AS purchases,
    1.0 + 20.0 / power(product.product_number, 0.55)
      + power(coalesce(purchases.purchases, 0), 0.72) * 12.0 AS weight
  FROM periods
  CROSS JOIN ranked_products product
  LEFT JOIN purchases ON purchases.day = periods.day AND purchases.product_id = product.id
), normalized AS (
  SELECT distribution.*,
    sum(weight) OVER (PARTITION BY day) AS total_weight
  FROM distribution
)
INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, product_views, add_to_carts,
  checkout_starts, purchases, created_at, updated_at
)
SELECT day, 'product', id::text,
  round(product_views * weight / total_weight)::integer,
  round(add_to_carts * weight / total_weight)::integer,
  round(checkout_starts * weight / total_weight)::integer,
  purchases, day::timestamptz + interval '1 day',
  day::timestamptz + interval '1 day'
FROM normalized;

INSERT INTO analytics_ai_daily_rollups (
  day, dimension, dimension_key, opens, messages, result_clicks, errors,
  runs, completed, failed, cancelled, helpful, not_helpful, input_tokens,
  output_tokens, total_tokens, duration_ms_total, duration_samples, tool_calls,
  created_at, updated_at
)
SELECT day, 'overall', '', round(sessions * 0.0048), round(sessions * 0.0067),
  round(sessions * 0.0019),
  CASE WHEN mod(extract(doy FROM day)::integer, 17) = 0 THEN 1 ELSE 0 END,
  round(sessions * 0.0062),
  greatest(0,
    round(sessions * 0.0062)
      - CASE WHEN mod(extract(doy FROM day)::integer, 17) = 0 THEN 1 ELSE 0 END
      - CASE WHEN mod(extract(doy FROM day)::integer, 47) = 0 THEN 1 ELSE 0 END),
  CASE WHEN mod(extract(doy FROM day)::integer, 17) = 0 THEN 1 ELSE 0 END,
  CASE WHEN mod(extract(doy FROM day)::integer, 47) = 0 THEN 1 ELSE 0 END,
  round(sessions * 0.001), round(sessions * 0.00012),
  round(sessions * 0.0062 * 680), round(sessions * 0.0062 * 220),
  round(sessions * 0.0062 * 900), round(sessions * 0.0062 * 1850)::bigint,
  round(sessions * 0.0062), round(sessions * 0.0084),
  day::timestamptz + interval '1 day', day::timestamptz + interval '1 day'
FROM analytics_daily_rollups
WHERE dimension = 'overall'
  AND day >= current_date - 900;

INSERT INTO analytics_ai_daily_rollups (
  day, dimension, dimension_key, messages, result_clicks, runs, completed, failed,
  input_tokens, output_tokens, total_tokens, duration_ms_total,
  duration_samples, tool_calls, created_at, updated_at
)
SELECT overall.day, 'intent', intent,
  round(overall.messages * share), round(overall.result_clicks * share),
  round(overall.runs * share),
  round(overall.completed * share), round(overall.failed * share),
  round(overall.input_tokens * share), round(overall.output_tokens * share),
  round(overall.total_tokens * share), round(overall.duration_ms_total * share)::bigint,
  round(overall.duration_samples * share), round(overall.tool_calls * share),
  overall.day::timestamptz + interval '1 day', overall.day::timestamptz + interval '1 day'
FROM analytics_ai_daily_rollups overall
CROSS JOIN (VALUES
  ('product_discovery', 0.38), ('comparison', 0.23), ('project_planning', 0.19),
  ('order_help', 0.12), ('other', 0.08)
) intents(intent, share)
WHERE overall.dimension = 'overall'
  AND overall.day >= current_date - 900;

INSERT INTO order_acquisition_attribution (
  order_id, semantics_version, attribution_model, channel, evidence,
  session_channel, session_evidence, source_session_id, referrer_domain,
  session_started_at, landing_path, utm_source, utm_medium, utm_campaign,
  meta_campaign_id, meta_adset_id, meta_ad_id, captured_at
)
SELECT id, 'v1', 'last_non_direct',
  channel, evidence, channel, evidence,
  session_id,
  CASE channel WHEN 'meta_paid' THEN 'facebook.com'
    WHEN 'google_organic' THEN 'google.com'
    WHEN 'other_referral' THEN 'bricolage.example.invalid' END,
  created_at - interval '18 minutes',
  CASE WHEN channel = 'meta_paid' THEN '/fr/landing/atelier-mobile' ELSE '/fr/products' END,
  CASE channel WHEN 'meta_paid' THEN 'facebook'
    WHEN 'google_organic' THEN 'google' WHEN 'google_paid' THEN 'google' ELSE NULL END,
  CASE WHEN channel IN ('meta_paid', 'google_paid') THEN 'paid'
    WHEN channel = 'google_organic' THEN 'organic' ELSE NULL END,
  CASE WHEN channel = 'meta_paid' THEN 'catalogue-atelier'
    WHEN channel = 'google_paid' THEN 'recherche-outillage' END,
  CASE WHEN channel = 'meta_paid' THEN 'campaign-' || campaign_number ELSE NULL END,
  CASE WHEN channel = 'meta_paid' THEN 'adset-' || campaign_number ELSE NULL END,
  CASE WHEN channel = 'meta_paid' THEN 'ad-' || campaign_number ELSE NULL END,
  created_at
FROM (
  SELECT selected.*, CASE selected.channel
    WHEN 'meta_paid' THEN 'paid_utm'
    WHEN 'google_organic' THEN 'google_source'
    WHEN 'direct_dark_social' THEN 'no_external_referrer'
    WHEN 'other_referral' THEN 'external_referrer'
    ELSE 'paid_utm'
  END evidence
  FROM (
    SELECT distributed.*, CASE
      WHEN selector < 42 THEN 'meta_paid'
      WHEN selector < 66 THEN 'google_organic'
      WHEN selector < 84 THEN 'direct_dark_social'
      WHEN selector < 94 THEN 'other_referral'
      ELSE 'google_paid'
    END channel
    FROM (
      SELECT orders.*,
        mod(hashtextextended(id::text || ':channel', 0) & 2147483647, 100) selector
      FROM orders
    ) distributed
  ) selected
) attributed
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN attributed.confirmed = 4 THEN CASE
      WHEN selector < 50 THEN 1 WHEN selector < 82 THEN 2 ELSE 3 END
    WHEN attributed.confirmed = 8 THEN CASE
      WHEN selector < 18 THEN 1 WHEN selector < 48 THEN 2 ELSE 3 END
    ELSE CASE WHEN selector < 34 THEN 1 WHEN selector < 67 THEN 2 ELSE 3 END
  END AS campaign_number
  FROM (
    SELECT mod(hashtextextended(attributed.id::text || ':campaign', 0) & 2147483647, 100)
      AS selector
  ) campaign_distribution
) campaign;

INSERT INTO order_ai_influence (
  order_id, semantics_version, level, same_session, source_session_id,
  opened_at, engaged_at, recommendation_clicked_at, clicked_product_ids,
  recommended_product_ordered, captured_at
)
SELECT orders.id, 'v1', level, true, orders.session_id,
  orders.created_at - interval '14 minutes',
  CASE WHEN level <> 'opened' THEN orders.created_at - interval '11 minutes' END,
  CASE WHEN level IN ('recommendation_clicked', 'recommended_product_ordered')
    THEN orders.created_at - interval '7 minutes' END,
  CASE WHEN line.product_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(line.product_id) END,
  level = 'recommended_product_ordered', orders.created_at
FROM orders
LEFT JOIN LATERAL (
  SELECT product_id FROM order_line_items WHERE order_id = orders.id ORDER BY id LIMIT 1
) line ON true
CROSS JOIN LATERAL (SELECT CASE mod(orders.id / 8, 4)
  WHEN 0 THEN 'opened' WHEN 1 THEN 'engaged'
  WHEN 2 THEN 'recommendation_clicked' ELSE 'recommended_product_ordered' END level) influence
WHERE mod(orders.id, 8) = 0
  AND orders.created_at::date >= current_date - 900;

INSERT INTO meta_ads_daily_insights (
  day, account_id, account_currency, account_timezone, campaign_id,
  campaign_name, adset_id, adset_name, ad_id, ad_name, objective,
  attribution_setting, action_report_time, attribution_windows, spend,
  impressions, reach, clicks, inline_link_clicks, outbound_clicks,
  unique_outbound_clicks, landing_page_views, add_to_carts,
  initiate_checkouts, leads, purchases, purchase_value, video_plays,
  video_p25_watched, video_p50_watched, video_p75_watched,
  video_p95_watched, video_p100_watched, video_average_watch_seconds,
  quality_ranking, engagement_rate_ranking, conversion_rate_ranking, synced_at
)
SELECT day, 'demo-account', 'EUR', 'Africa/Algiers',
  'campaign-' || campaign_number,
  (ARRAY['L’atelier mobile','Mesure précise','Rangement du garage'])[campaign_number],
  'adset-' || campaign_number,
  (ARRAY['Artisans de 25 à 44 ans','Bricoleurs engagés','Visiteurs du catalogue'])[campaign_number],
  'ad-' || campaign_number,
  (ARRAY['Le coffret de 55 pièces','Tracer juste du premier coup','Un atelier où tout se trouve'])[campaign_number],
  'OUTCOME_SALES',
  '7d_click,1d_view', 'conversion', '["7d_click","1d_view"]',
  900 + campaign_number * 150 + mod(extract(doy FROM day)::integer, 11) * 12,
  190000 + campaign_number * 45000
    + mod(extract(doy FROM day)::integer * 997, 25000),
  145000 + campaign_number * 34000,
  4300 + campaign_number * 650, 3700 + campaign_number * 570,
  3350 + campaign_number * 520, 3050 + campaign_number * 470,
  2800 + campaign_number * 430, 110 + campaign_number * 25,
  45 + campaign_number * 12, 18 + campaign_number * 6,
  16 + campaign_number * 2 + mod(extract(doy FROM day)::integer + campaign_number, 5),
  (16 + campaign_number * 2
    + mod(extract(doy FROM day)::integer + campaign_number, 5)) * 450,
  90000 + campaign_number * 12000, 58000, 39000, 25000, 14000, 8500, 7.8,
  'AVERAGE', 'ABOVE_AVERAGE', 'AVERAGE', day::timestamptz + interval '1 day'
FROM demo_runtime.timeline timeline
CROSS JOIN LATERAL generate_series(
  timeline.history_start,
  timeline.history_end,
  interval '1 day'
) day
CROSS JOIN generate_series(1, 3) campaign_number;

INSERT INTO meta_ads_delivery_entities (
  entity_type, entity_id, account_id, campaign_id, campaign_name, name,
  status, effective_status, objective, optimization_goal, billing_event,
  daily_budget, budget_remaining, start_time, synced_at
)
SELECT 'campaign', 'campaign-' || number, 'demo-account', 'campaign-' || number,
  (ARRAY['L’atelier mobile','Mesure précise','Rangement du garage'])[number],
  (ARRAY['L’atelier mobile','Mesure précise','Rangement du garage'])[number],
  CASE WHEN number = 3 THEN 'PAUSED' ELSE 'ACTIVE' END,
  CASE WHEN number = 3 THEN 'PAUSED' ELSE 'ACTIVE' END,
  'OUTCOME_SALES', 'OFFSITE_CONVERSIONS', 'IMPRESSIONS',
  2000 + number * 400, 8400 - number * 700, timeline.history_start,
  timeline.history_end::timestamptz + interval '22 hours'
FROM generate_series(1, 3) number
CROSS JOIN demo_runtime.timeline timeline;

CREATE TABLE demo_runtime.search_queries (
  query_number integer PRIMARY KEY,
  query text NOT NULL,
  product_key text NOT NULL,
  device text NOT NULL,
  impression_share numeric NOT NULL,
  click_share numeric NOT NULL,
  base_position numeric NOT NULL
);

INSERT INTO demo_runtime.search_queries VALUES
  (1, 'perceuse sans fil algérie', 'abo:B07XCVXGPG', 'MOBILE', 0.18, 0.23, 2.4),
  (2, 'meuleuse 125 mm prix', 'esci:B07457BXJW', 'MOBILE', 0.17, 0.10, 4.8),
  (3, 'caisse à outils complète', 'abo:B004X7I1FC', 'MOBILE', 0.15, 0.20, 6.1),
  (4, 'multimètre numérique', 'abo:B07VY421KJ', 'DESKTOP', 0.14, 0.08, 8.4),
  (5, 'projecteur chantier led', 'abo:B07V5JLRXS', 'MOBILE', 0.12, 0.15, 5.2),
  (6, 'compresseur atelier prix', 'abo:B074DD8NVY', 'DESKTOP', 0.10, 0.06, 16.4),
  (7, 'مثقاب لاسلكي الجزائر', 'esci:B073VJPM4Z', 'MOBILE', 0.08, 0.10, 11.8),
  (8, 'casque soudure', 'esci:B07LHDC74K', 'MOBILE', 0.06, 0.08, 18.2);

INSERT INTO search_console_daily_totals (
  day, search_type, clicks, impressions, ctr, position, data_state, synced_at
)
SELECT overall.day, 'web', metrics.clicks, metrics.impressions,
  metrics.clicks::numeric / metrics.impressions,
  7.2 + 1.2 * (timeline.history_end - overall.day)::numeric /
    greatest(timeline.history_end - (timeline.history_start + 365), 1)
    + 0.12 * sin(extract(doy FROM overall.day) * pi() / 29),
  'final', overall.day::timestamptz + interval '2 days'
FROM analytics_daily_rollups overall
CROSS JOIN demo_runtime.timeline timeline
CROSS JOIN LATERAL (
  SELECT round(overall.sessions * (
      0.0045 + 0.00035 * sin(extract(doy FROM overall.day) * pi() / 41)
    ))::integer clicks,
    round(overall.sessions * (
      0.105 + 0.006 * sin(extract(doy FROM overall.day) * pi() / 53)
    ))::integer impressions
) metrics
WHERE overall.dimension = 'overall'
  AND overall.day >= timeline.history_start + 365;

INSERT INTO search_console_daily_rows (
  day, search_type, query, page, country, device, clicks, impressions,
  ctr, position, synced_at
)
WITH allocated AS (
  SELECT total.*, profile.*, product.slug,
    floor(total.clicks * profile.click_share)::integer AS base_clicks,
    floor(total.impressions * profile.impression_share)::integer AS base_impressions
  FROM search_console_daily_totals total
  CROSS JOIN demo_runtime.search_queries profile
  JOIN products product ON product.mongo_id = profile.product_key
), reconciled AS (
  SELECT allocated.*,
    CASE WHEN query_number = 1
      THEN clicks - sum(base_clicks) OVER (PARTITION BY day) + base_clicks
      ELSE base_clicks END AS row_clicks,
    CASE WHEN query_number = 1
      THEN impressions - sum(base_impressions) OVER (PARTITION BY day) + base_impressions
      ELSE base_impressions END AS row_impressions
  FROM allocated
)
SELECT day, 'web', query,
  :'storefront_origin' || '/fr/products/' || slug, 'dza', device,
  row_clicks, row_impressions, row_clicks::numeric / nullif(row_impressions, 0),
  greatest(1, base_position
    + 1.2 * ((SELECT history_end FROM demo_runtime.timeline) - day)::numeric /
      greatest((SELECT history_end - (history_start + 365) FROM demo_runtime.timeline), 1)
    + 0.12 * sin(extract(doy FROM day) * pi() / 29)),
  synced_at
FROM reconciled;

INSERT INTO search_console_daily_appearances (
  day, search_type, appearance, clicks, impressions, ctr, position, synced_at
)
SELECT day, 'web', appearance, round(clicks * 0.18), round(impressions * 0.22), ctr,
  position - 0.4, synced_at
FROM search_console_daily_totals
CROSS JOIN unnest(ARRAY['product_snippet','merchant_listing']) appearance;

INSERT INTO search_console_sitemaps (
  path, site_url, type, is_pending, is_sitemaps_index, warnings, errors,
  submitted_urls, contents, last_submitted_at, last_downloaded_at, synced_at
)
SELECT
  :'storefront_origin' || '/sitemap.xml',
  :'storefront_origin' || '/', 'sitemap', false, true, 0, 0,
  (SELECT count(*) FROM products WHERE active),
  jsonb_build_array(jsonb_build_object('type','web','submitted',(SELECT count(*) FROM products WHERE active))),
  timeline.history_end - 1, timeline.history_end,
  timeline.history_end::timestamptz + interval '23 hours'
FROM demo_runtime.timeline timeline;

INSERT INTO admin.profit_tracker_days (
  day, spend_eur, fb_purchases, cpm, ctr, link_clicks, landing_page_views,
  fx_rate_used, meta_synced_at
)
SELECT day, sum(spend), sum(purchases),
  sum(spend) * 1000 / nullif(sum(impressions), 0),
  sum(clicks) * 100 / nullif(sum(impressions), 0), sum(clicks),
  sum(landing_page_views), 150, max(synced_at)
FROM meta_ads_daily_insights GROUP BY day;

INSERT INTO admin.analytics_order_cohort_facts (
  order_id, posted_day, delivered_at, paid_at, outcome, submitted_cod_dzd,
  current_cod_dzd, delivery_fee_dzd, product_cost_dzd, gross_profit_dzd,
  automatic_paid_profit_dzd, cost_complete, wilaya_id, commune,
  delivery_mode, attempt_count, meta_campaign_id, meta_adset_id, meta_ad_id,
  semantics_version, refreshed_at
)
SELECT orders.id, (orders.created_at + interval '2 hours')::date,
  CASE WHEN orders.confirmed IN (4, 10) THEN orders.created_at + interval '3 days' END,
  CASE WHEN orders.confirmed = 4 THEN orders.created_at + interval '4 days' END,
  CASE orders.confirmed WHEN 4 THEN 'payed' WHEN 10 THEN 'livre_non_encaisse'
    WHEN 8 THEN 'retour_archive' WHEN 9 THEN 'annule'
    ELSE orders.ecotrack_status END,
  orders.total_amount, orders.total_amount, orders.del_pr, costs.product_cost,
  orders.total_amount - orders.del_pr - costs.product_cost,
  CASE WHEN orders.confirmed = 4 THEN orders.total_amount - orders.del_pr - costs.product_cost END,
  true, orders.state, orders.city,
  CASE WHEN orders.delivery = 1 THEN 'stop_desk' ELSE 'home' END,
  CASE WHEN orders.confirmed IN (5, 8, 9) THEN 2 ELSE 1 END,
  attribution.meta_campaign_id, attribution.meta_adset_id, attribution.meta_ad_id,
  1, now()
FROM orders
JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id
JOIN order_acquisition_attribution attribution ON attribution.order_id = orders.id
JOIN LATERAL (
  SELECT sum(coalesce(unit_purchase_price_snapshot, 0) * quantity) product_cost
  FROM order_line_items WHERE order_id = orders.id
) costs ON true;

INSERT INTO admin.analytics_economics_daily_facts (
  day, posted_orders, paid_orders, cost_complete_orders,
  paid_profit_complete_orders, gross_profit_dzd, adjusted_profit_dzd,
  ad_cost_dzd, operating_cost_dzd, net_profit_dzd, true_profit_dzd,
  automatic_paid_cod_dzd, automatic_paid_fees_dzd,
  automatic_paid_profit_dzd, fx_rate_used, planning_return_rate_pct,
  semantics_version, refreshed_at
)
SELECT cohort.posted_day, count(*), count(*) FILTER (WHERE outcome IN ('paye_et_archive', 'payed')),
  count(*) FILTER (WHERE cost_complete),
  count(*) FILTER (WHERE outcome IN ('paye_et_archive', 'payed') AND cost_complete),
  sum(cohort.gross_profit_dzd), sum(cohort.gross_profit_dzd) * 0.865,
  coalesce(max(day_cost.spend_eur), 0) * 150, 900,
  sum(cohort.gross_profit_dzd) * 0.865 - coalesce(max(day_cost.spend_eur), 0) * 150 - 900,
  sum(cohort.gross_profit_dzd) * 0.865 - coalesce(max(day_cost.spend_eur), 0) * 150 - 900,
  sum(cohort.current_cod_dzd) FILTER (WHERE outcome IN ('paye_et_archive', 'payed')),
  sum(cohort.delivery_fee_dzd) FILTER (WHERE outcome IN ('paye_et_archive', 'payed')),
  sum(cohort.automatic_paid_profit_dzd), 150, 13.5, 1, now()
FROM admin.analytics_order_cohort_facts cohort
LEFT JOIN admin.profit_tracker_days day_cost ON day_cost.day = cohort.posted_day
GROUP BY cohort.posted_day;

WITH counters AS (
  SELECT dimension_key::bigint product_id, sum(product_views) views,
    sum(add_to_carts) carts, sum(checkout_starts) checkouts,
    sum(purchases) purchases
  FROM analytics_daily_rollups WHERE dimension = 'product' GROUP BY dimension_key
), units AS (
  SELECT line.product_id, sum(line.quantity) units
  FROM order_line_items line JOIN orders ON orders.id = line.order_id
  WHERE orders.confirmed IN (4, 10) GROUP BY line.product_id
)
UPDATE products SET view_count = counters.views, add_to_cart_count = counters.carts,
  checkout_count = counters.checkouts, purchase_count = counters.purchases,
  units_sold = coalesce(units.units, 0),
  popularity_score = round((counters.views * 0.02 + counters.carts * 0.8 + counters.purchases * 3)::numeric, 2),
  conversion_rate = round(counters.purchases * 100.0 / nullif(counters.views, 0), 4),
  last_viewed_at = now()
FROM counters LEFT JOIN units ON units.product_id = counters.product_id
WHERE products.id = counters.product_id;

UPDATE brands SET view_count = totals.views, add_to_cart_count = totals.carts,
  checkout_count = totals.checkouts, purchase_count = totals.purchases,
  popularity_score = totals.score,
  conversion_rate = round(totals.purchases * 100.0 / nullif(totals.views, 0), 4),
  last_viewed_at = now()
FROM (
  SELECT brand_id, sum(view_count) views, sum(add_to_cart_count) carts,
    sum(checkout_count) checkouts, sum(purchase_count) purchases,
    sum(popularity_score) score FROM products GROUP BY brand_id
) totals WHERE brands.id = totals.brand_id;

UPDATE categories SET view_count = totals.views, add_to_cart_count = totals.carts,
  checkout_count = totals.checkouts, purchase_count = totals.purchases,
  popularity_score = totals.score,
  conversion_rate = round(totals.purchases * 100.0 / nullif(totals.views, 0), 4),
  last_viewed_at = now()
FROM (
  SELECT category_id, sum(view_count) views, sum(add_to_cart_count) carts,
    sum(checkout_count) checkouts, sum(purchase_count) purchases,
    sum(popularity_score) score FROM products GROUP BY category_id
) totals WHERE categories.id = totals.category_id;

UPDATE categories parent SET view_count = totals.views, add_to_cart_count = totals.carts,
  checkout_count = totals.checkouts, purchase_count = totals.purchases,
  popularity_score = totals.score,
  conversion_rate = round(totals.purchases * 100.0 / nullif(totals.views, 0), 4),
  last_viewed_at = now()
FROM (
  SELECT child.parent_id, sum(child.view_count) views, sum(child.add_to_cart_count) carts,
    sum(child.checkout_count) checkouts, sum(child.purchase_count) purchases,
    sum(child.popularity_score) score
  FROM categories child WHERE child.parent_id IS NOT NULL GROUP BY child.parent_id
) totals WHERE parent.id = totals.parent_id;

INSERT INTO analytics_paid_click_daily_rollups (
  day, variant, paid_source, has_order, landing_path, visits, landed_only,
  viewed_product, added_to_cart, began_checkout, created_order, purchased,
  errored, created_at, updated_at
)
SELECT overall.day, 'storefront', source, has_order, '/fr/products',
  CASE source WHEN 'meta' THEN round(overall.sessions * 0.28)
    WHEN 'google' THEN round(overall.sessions * 0.07)
    ELSE round(overall.sessions * 0.03) END,
  round(overall.sessions * share * 0.18), round(overall.sessions * share * 0.72),
  round(overall.sessions * share * 0.21), round(overall.sessions * share * 0.12),
  round(overall.sessions * share * 0.07), round(overall.sessions * share * 0.045),
  CASE WHEN mod(extract(doy FROM overall.day)::integer, 31) = 0 THEN 1 ELSE 0 END,
  overall.day::timestamptz + interval '1 day', overall.day::timestamptz + interval '1 day'
FROM analytics_daily_rollups overall
CROSS JOIN (VALUES ('meta', 0.28, 1), ('google', 0.07, 1), ('tiktok', 0.03, 0))
  paid(source, share, has_order)
WHERE overall.dimension = 'overall';

INSERT INTO analytics_distinct_daily_members (day, metric, dimension_key, member_id, created_at)
SELECT overall.day, members.metric, members.dimension_key,
  members.metric || ':' || overall.day || ':' || member_number,
  overall.day::timestamptz + interval '1 day'
FROM analytics_daily_rollups overall
CROSS JOIN LATERAL (VALUES
  ('journey', '', greatest(25, round(overall.journeys * 0.42)::integer)),
  ('customer', '', greatest(12, round(overall.purchases * 0.74)::integer)),
  ('ai_journey', '', CASE WHEN overall.day >= current_date - 900
    THEN greatest(4, round(overall.sessions * 0.0032)::integer) ELSE 0 END)
) members(metric, dimension_key, member_count)
CROSS JOIN LATERAL generate_series(1, least(member_count, 160)) member_number
WHERE overall.dimension = 'overall';

INSERT INTO meta_ads_breakdown_daily_insights (
  day, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id,
  ad_name, breakdown_kind, publisher_platform, platform_position,
  impression_device, region, spend, impressions, reach, clicks,
  outbound_clicks, landing_page_views, purchases, purchase_value, synced_at
)
SELECT insight.day, insight.account_id, insight.campaign_id, insight.campaign_name,
  insight.adset_id, insight.adset_name, insight.ad_id, insight.ad_name,
  breakdown.kind,
  CASE WHEN breakdown.kind = 'placement' THEN breakdown.label ELSE '' END,
  CASE WHEN breakdown.kind = 'placement' THEN 'feed' ELSE '' END,
  CASE WHEN breakdown.kind = 'device' THEN breakdown.label ELSE '' END,
  CASE WHEN breakdown.kind = 'region' THEN breakdown.label ELSE '' END,
  insight.spend * breakdown.share, round(insight.impressions * breakdown.share),
  round(insight.reach * breakdown.share), round(insight.clicks * breakdown.share),
  insight.outbound_clicks * breakdown.share,
  insight.landing_page_views * breakdown.share,
  insight.purchases * breakdown.share, insight.purchase_value * breakdown.share,
  insight.synced_at
FROM meta_ads_daily_insights insight
CROSS JOIN (VALUES
  ('placement', 'facebook', 0.48), ('placement', 'instagram', 0.52),
  ('device', 'mobile_app', 0.82), ('device', 'desktop', 0.18),
  ('region', 'Alger', 0.31), ('region', 'Oran', 0.18),
  ('region', 'Sétif', 0.14), ('region', 'Constantine', 0.13),
  ('region', 'Other', 0.24)
) breakdown(kind, label, share);

INSERT INTO search_console_url_inspections (
  url, site_url, verdict, coverage_state, robots_txt_state, indexing_state,
  page_fetch_state, google_canonical, user_canonical, last_crawl_at, crawled_as,
  referring_urls, sitemap_urls, rich_results, inspected_at
)
SELECT :'storefront_origin' || '/fr/products/' || product.slug,
  :'storefront_origin' || '/',
  CASE WHEN mod(product.id, 13) = 0 THEN 'NEUTRAL' ELSE 'PASS' END,
  CASE WHEN mod(product.id, 13) = 0 THEN 'Discovered - currently not indexed'
    ELSE 'Submitted and indexed' END,
  'ALLOWED', 'INDEXING_ALLOWED', 'SUCCESSFUL',
  :'storefront_origin' || '/fr/products/' || product.slug,
  :'storefront_origin' || '/fr/products/' || product.slug,
  timeline.history_end::timestamptz - interval '2 days' + interval '8 hours', 'MOBILE', '[]',
  jsonb_build_array(:'storefront_origin' || '/sitemap.xml'),
  jsonb_build_object('productSnippets', jsonb_build_object('verdict', 'PASS')),
  timeline.history_end::timestamptz - interval '1 day' + interval '8 hours'
FROM products product
CROSS JOIN demo_runtime.timeline timeline
ORDER BY popularity_score DESC, id LIMIT 120;

INSERT INTO demo_runtime.dataset_metrics VALUES
  ('generated_historical_sessions', 12000000, 'Sessions represented in durable rollups'),
  ('generated_historical_events', 72000000, 'Six-event equivalent represented in durable rollups'),
  ('analytics_rollup_days', 1680, 'Continuous history before the reset-relative live window');
