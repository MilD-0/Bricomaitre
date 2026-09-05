BEGIN;

CREATE TABLE demo_runtime.live_metadata (
  id integer PRIMARY KEY CHECK (id = 1),
  reset_at timestamptz NOT NULL
);
INSERT INTO demo_runtime.live_metadata VALUES (1, now());

CREATE TEMP TABLE live_order_seed AS
WITH candidates AS (
  SELECT i,
    CASE WHEN i <= 1350 THEN 160000 + i ELSE 1 + mod(i * 41, 160000) END customer_id,
    floor((i - 1) / 180)::integer age_days,
    mod(i * 47, 100) status_roll
  FROM generate_series(1, 1800) i
)
SELECT *, 1 + mod(customer_id * 37, 1541) commune_id,
  (current_date - age_days)::timestamp
    + (mod(
      i * 7919,
      CASE WHEN age_days = 0
        THEN greatest(1, extract(epoch FROM now() - current_date)::integer)
        ELSE 86400
      END
    )::text || ' seconds')::interval AS ordered_at,
  CASE
    WHEN age_days = 0 THEN CASE
      WHEN status_roll < 28 THEN 0 WHEN status_roll < 43 THEN 1
      WHEN status_roll < 62 THEN 2 WHEN status_roll < 80 THEN 6 ELSE 11 END
    WHEN age_days = 1 THEN CASE
      WHEN status_roll < 8 THEN 0 WHEN status_roll < 18 THEN 1
      WHEN status_roll < 42 THEN 2 WHEN status_roll < 58 THEN 6
      WHEN status_roll < 82 THEN 11 WHEN status_roll < 93 THEN 3 ELSE 7 END
    WHEN age_days = 2 THEN CASE
      WHEN status_roll < 10 THEN 1 WHEN status_roll < 25 THEN 2
      WHEN status_roll < 45 THEN 11 WHEN status_roll < 65 THEN 3
      WHEN status_roll < 80 THEN 5 WHEN status_roll < 92 THEN 7 ELSE 4 END
    WHEN age_days = 3 THEN CASE
      WHEN status_roll < 10 THEN 2 WHEN status_roll < 35 THEN 11
      WHEN status_roll < 55 THEN 3 WHEN status_roll < 70 THEN 5
      WHEN status_roll < 87 THEN 7 ELSE 4 END
    ELSE CASE
      WHEN status_roll < 68 THEN 4 WHEN status_roll < 77 THEN 10
      WHEN status_roll < 92 THEN 8 WHEN status_roll < 97 THEN 9
      WHEN status_roll = 97 THEN 3 WHEN status_roll = 98 THEN 5 ELSE 7 END
  END in_house_status
FROM candidates;

INSERT INTO orders (
  mongo_id, first_name, last_name, state, city, home_address, email,
  phone_number_1, normalized_phone, public_token, public_token_expires_at,
  cart_products, visit_id, journey_id, session_id, variant, delivery, del_pr,
  product_subtotal, total_amount, price, note, confirmed, no_answer_count,
  confirmed_by, confirmed_by_name, confirmed_at, created_at, updated_at
)
SELECT 'demo-live-order:' || seed.i,
  (ARRAY['Amine','Nadia','Yacine','Lina','Sofiane','Sarah','Karim','Meriem','Riad','Inès','Walid','Aya','Samir','Leïla','Nabil','Imane','Farid','Yasmine','Adel','Nesrine','Mehdi','Sabrina','Anis','Selma'])[1 + mod(seed.customer_id - 1, 24)],
  (ARRAY['Benali','Kaci','Meziane','Saadi','Boudiaf','Haddad','Cherif','Mansouri','Brahimi','Ait Ali','Bensaid','Rahmani','Bouzid','Belhadj','Mebarki','Dahmani','Ferhat','Zerrouki','Hamidi','Belkacem','Lounis','Khelifi','Amrani','Gacem'])[1 + mod((seed.customer_id - 1) / 24, 24)],
  commune.wilaya_id, commune.name,
  (10 + mod(seed.customer_id, 190)) || ' rue de démonstration, ' || commune.name,
  CASE WHEN mod(seed.customer_id, 4) = 0
    THEN 'visiteur' || seed.customer_id || '@demo.bricomaitre.invalid' END,
  '000' || lpad(seed.customer_id::text, 7, '0'),
  '000' || lpad(seed.customer_id::text, 7, '0'),
  md5('demo-public-order:' || seed.i), now() + interval '30 days', '{}',
  CASE WHEN seed.age_days < 7
    THEN 'demo-live-visit-' || ((seed.i - 1) * 54 + 1 + mod(seed.i * 13, 54))
    ELSE 'demo-retained-visit-' || seed.i END,
  CASE WHEN seed.age_days < 7
    THEN 'demo-live-journey-' || ((seed.i - 1) * 54 + 1 + mod(seed.i * 13, 54))
    ELSE 'demo-retained-journey-' || seed.i END,
  CASE WHEN seed.age_days < 7
    THEN 'demo-live-session-' || ((seed.i - 1) * 54 + 1 + mod(seed.i * 13, 54))
    ELSE 'demo-retained-session-' || seed.i END, 'storefront',
  CASE WHEN commune.has_stop_desk AND mod(seed.i, 4) = 0 THEN 1 ELSE 0 END,
  CASE WHEN commune.has_stop_desk AND mod(seed.i, 4) = 0
    THEN fees.stop_desk_fee ELSE fees.home_fee END,
  0, 0, 0,
  CASE WHEN mod(seed.i, 31) = 0 THEN 'Appeler après 17 h. Note synthétique.' END,
  seed.in_house_status,
  CASE WHEN seed.in_house_status = 1 THEN 1 + mod(seed.i, 3) ELSE 0 END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6 THEN
    (ARRAY['amine@demo.bricomaitre.invalid','sarah@demo.bricomaitre.invalid'])[1 + mod(seed.i, 2)] END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6 THEN
    (ARRAY['Amine Kaci','Sarah Meziane'])[1 + mod(seed.i, 2)] END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6
    THEN least(now(), seed.ordered_at + interval '35 minutes') END,
  seed.ordered_at,
  least(now(), seed.ordered_at
    + CASE WHEN seed.in_house_status = 0 THEN interval '0' ELSE interval '35 minutes' END)
FROM live_order_seed seed
JOIN admin.ecotrack_communes commune ON commune.commune_id = seed.commune_id
JOIN admin.ecotrack_service_fees fees
  ON fees.wilaya_id = commune.wilaya_id AND fees.service_type = 'livraison';

INSERT INTO order_line_items (
  order_id, product_id, content_id, raw_value, title_snapshot,
  original_unit_price, effective_unit_price, unit_purchase_price_snapshot,
  purchase_cost_source, quantity, discount_amount, line_total, thumbnail_url,
  created_at, updated_at
)
SELECT orders.id, product.id, 'live-line-' || orders.id || '-' || position,
  product.slug, product.title, product.price,
  product.price - CASE WHEN mod(orders.id + position, 41) = 0 THEN 300 ELSE 0 END,
  product.purchase_price, 'order_snapshot', 1 + mod(orders.id + position, 2),
  CASE WHEN mod(orders.id + position, 41) = 0 THEN 300 ELSE 0 END,
  (product.price - CASE WHEN mod(orders.id + position, 41) = 0 THEN 300 ELSE 0 END)
    * (1 + mod(orders.id + position, 2)),
  product.images[1], orders.created_at, orders.updated_at
FROM orders CROSS JOIN generate_series(1, 4) position
CROSS JOIN LATERAL (
  SELECT hashtextextended(orders.id::text || ':live:' || position, 0) & 2147483647 AS selector
) distribution
CROSS JOIN LATERAL (
  SELECT * FROM products
  WHERE id = CASE
    WHEN mod(distribution.selector, 100) < 10 THEN (
      SELECT product_id FROM demo_runtime.merchandise_product_ids
      WHERE placement = 'top'
        AND sort_order = 1 + mod(distribution.selector, 4)
    )
    WHEN mod(distribution.selector, 100) < 22 THEN (
      SELECT product_id FROM (
        SELECT product_id, row_number() OVER (ORDER BY placement, sort_order) AS position
        FROM demo_runtime.merchandise_product_ids WHERE placement <> 'top'
      ) featured
      WHERE featured.position = 1 + mod(distribution.selector, 12)
    )
    WHEN mod(distribution.selector, 100) < 52
      THEN 1 + mod(distribution.selector, 320)
    ELSE 1 + mod(distribution.selector, (SELECT count(*) FROM products))
  END
) product
WHERE orders.mongo_id LIKE 'demo-live-order:%';

UPDATE orders SET cart_products = totals.cart_products,
  product_subtotal = totals.subtotal,
  total_amount = totals.subtotal + coalesce(orders.del_pr, 0),
  price = totals.subtotal + coalesce(orders.del_pr, 0)
FROM (
  SELECT order_id, array_agg(raw_value ORDER BY id) cart_products, sum(line_total) subtotal
  FROM order_line_items
  WHERE content_id LIKE 'live-line-%'
  GROUP BY order_id
) totals WHERE orders.id = totals.order_id;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, 0, 0, NULL, NULL, created_at FROM orders
WHERE mongo_id LIKE 'demo-live-order:%';

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, CASE WHEN confirmed = 1 THEN 1 WHEN confirmed = 6 THEN 6 ELSE 2 END,
  no_answer_count, confirmed_by, confirmed_by_name,
  least(now(), created_at + interval '35 minutes')
FROM orders WHERE mongo_id LIKE 'demo-live-order:%' AND confirmed <> 0;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, 11, 0, confirmed_by, confirmed_by_name,
  least(now(), created_at + interval '2 hours')
FROM orders
WHERE mongo_id LIKE 'demo-live-order:%' AND confirmed IN (3, 4, 5, 7, 8, 9, 10, 11);

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, confirmed, 0, confirmed_by, confirmed_by_name,
  least(now(), created_at + CASE confirmed
    WHEN 9 THEN interval '3 days'
    WHEN 3 THEN interval '2 days'
    WHEN 5 THEN interval '2 days'
    ELSE interval '4 days'
  END)
FROM orders
WHERE mongo_id LIKE 'demo-live-order:%' AND confirmed IN (3, 4, 5, 7, 8, 9, 10);

CREATE TEMP TABLE live_shipped_orders AS
SELECT id order_id, row_number() OVER (ORDER BY created_at, id) shipment_number
FROM orders WHERE mongo_id LIKE 'demo-live-order:%' AND confirmed IN (3, 4, 5, 7, 8, 9, 10, 11);

UPDATE orders SET
  ecotrack_status = CASE confirmed
    WHEN 3 THEN 'en_preparation' WHEN 4 THEN 'payed' WHEN 5 THEN 'suspendu'
    WHEN 7 THEN 'en_livraison' WHEN 8 THEN 'retour_archive'
    WHEN 9 THEN 'annule' WHEN 10 THEN 'livre_non_encaisse' ELSE 'prete_a_expedier' END,
  ecotrack_status_last_update = least(now(), created_at + interval '4 days'),
  ecotrack_status_data = jsonb_build_object('source', 'deterministic-demo', 'status', confirmed),
  ecotrack_reference = 'DEMO-LIVE-' || shipped.shipment_number,
  ecotrack_tracking_number = CASE WHEN mod(shipped.shipment_number, 4) = 0 THEN 'EMD' ELSE 'DLD' END
    || lpad((199400 + shipped.shipment_number)::text, 9, '0'),
  updated_at = least(now(), created_at + interval '4 days')
FROM live_shipped_orders shipped WHERE orders.id = shipped.order_id;

INSERT INTO admin.ecotrack_order_states (
  order_id, reference, tracking_number, provider, current_status, current_amount,
  current_amount_source, delivery_tariff, return_tariff, stop_desk, payment_id,
  status_reason, provider_created_at, provider_updated_at, estimated_fee,
  desk_commune, raw_status_payload, raw_create_payload, raw_order_payload,
  last_status_synced_at, last_tracking_synced_at, last_maj_synced_at,
  last_order_synced_at, last_action_at, created_at, updated_at
)
SELECT orders.id, orders.ecotrack_reference, orders.ecotrack_tracking_number,
  CASE WHEN orders.ecotrack_tracking_number LIKE 'EMD%' THEN 'emir' ELSE 'delivro' END,
  orders.ecotrack_status, orders.total_amount, 'ecotrack_orders', orders.del_pr,
  CASE WHEN orders.confirmed = 8 THEN round(orders.del_pr * 0.45, 2) ELSE 0 END,
  orders.delivery = 1,
  CASE WHEN orders.confirmed = 4 THEN 'PAY-' || orders.ecotrack_reference END,
  CASE WHEN orders.confirmed = 5 THEN 'Customer requested another delivery day'
    WHEN orders.confirmed = 9 THEN 'Address could not be reached' END,
  least(now(), orders.created_at + interval '2 hours'),
  least(now(), orders.created_at + interval '4 days'),
  orders.del_pr, CASE WHEN orders.delivery = 1 THEN orders.city END,
  jsonb_build_object('status', orders.ecotrack_status, 'synthetic', true),
  jsonb_build_object('reference', orders.ecotrack_reference, 'synthetic', true),
  jsonb_build_object('amount', orders.total_amount, 'synthetic', true),
  least(now(), orders.created_at + interval '4 days'),
  least(now(), orders.created_at + interval '4 days'),
  least(now(), orders.created_at + interval '4 days'),
  least(now(), orders.created_at + interval '4 days'),
  least(now(), orders.created_at + interval '4 days'),
  least(now(), orders.created_at + interval '2 hours'),
  least(now(), orders.created_at + interval '4 days')
FROM orders JOIN live_shipped_orders shipped ON shipped.order_id = orders.id;

INSERT INTO admin.ecotrack_order_status_observations (
  order_id, tracking_number, status, effective_at, first_observed_at,
  last_observed_at, source, source_key
)
SELECT orders.id, orders.ecotrack_tracking_number,
  CASE observation WHEN 1 THEN 'en_preparation' ELSE orders.ecotrack_status END,
  least(now(), orders.created_at + (observation * interval '2 days')),
  least(now(), orders.created_at + (observation * interval '2 days')),
  least(now(), orders.created_at + (observation * interval '2 days')),
  'orders_status', 'live-status-' || observation
FROM orders JOIN live_shipped_orders shipped ON shipped.order_id = orders.id
CROSS JOIN generate_series(1, 2) observation;

INSERT INTO admin.ecotrack_order_tracking_events (
  order_id, tracking_number, event_date, event_time, status, scan_location, raw
)
SELECT orders.id, orders.ecotrack_tracking_number,
  least(now(), orders.created_at + event_number * interval '1 day')::date,
  lpad((8 + event_number * 3)::text, 2, '0') || ':20',
  CASE event_number
    WHEN 1 THEN 'accepted_by_carrier'
    WHEN 2 THEN 'in_transit'
    WHEN 3 THEN CASE WHEN orders.confirmed IN (4, 10) THEN 'livred'
      WHEN orders.confirmed IN (8, 9) THEN 'attempt_delivery'
      ELSE orders.ecotrack_status END
    ELSE CASE orders.confirmed WHEN 4 THEN 'payed' WHEN 8 THEN 'returned'
      WHEN 9 THEN 'cancelled' ELSE orders.ecotrack_status END
  END,
  CASE event_number WHEN 1 THEN 'Hub central' WHEN 2 THEN 'Centre de tri' ELSE orders.city END,
  jsonb_build_object('synthetic', true, 'sequence', event_number)
FROM orders JOIN live_shipped_orders shipped ON shipped.order_id = orders.id
CROSS JOIN generate_series(1, 4) event_number;

INSERT INTO admin.processed_orders (
  order_id, tracking, customer_name, wilaya, commune, delivery_type,
  amount_collected, total_fees, net_revenue, product_cost, profit,
  fee_livraison, fee_poids, fee_extra, fee_sms, fee_stockage, fee_commission,
  delivered_at, order_created_at, encaissed_at, import_batch_id, imported_at
)
SELECT orders.id::text, orders.ecotrack_tracking_number,
  orders.first_name || ' ' || orders.last_name, wilaya.name, orders.city,
  CASE WHEN orders.delivery = 1 THEN 'stop_desk' ELSE 'home' END,
  orders.total_amount, orders.del_pr + 35, orders.total_amount - orders.del_pr - 35,
  costs.product_cost, orders.total_amount - orders.del_pr - 35 - costs.product_cost,
  orders.del_pr, 0, 0, 10, 0, 25,
  least(now(), orders.created_at + interval '3 days'), orders.created_at,
  least(now(), orders.created_at + interval '4 days'),
  'demo-live-settlement', now()
FROM orders JOIN admin.ecotrack_wilayas wilaya ON wilaya.wilaya_id = orders.state
JOIN LATERAL (
  SELECT sum(coalesce(unit_purchase_price_snapshot, 0) * quantity) product_cost
  FROM order_line_items WHERE order_id = orders.id
) costs ON true
WHERE orders.mongo_id LIKE 'demo-live-order:%' AND orders.confirmed = 4;

INSERT INTO admin.processed_order_products (
  processed_order_id, product_id, title, price, cost, sku,
  category_id, category_name, brand_id, brand_name
)
SELECT processed.id, line.product_id::text, line.title_snapshot, line.line_total,
  coalesce(line.unit_purchase_price_snapshot, 0) * line.quantity, product.sku,
  category.id::text, category.name, brand.id::text, brand.name
FROM admin.processed_orders processed
JOIN order_line_items line ON line.order_id::text = processed.order_id
LEFT JOIN products product ON product.id = line.product_id
LEFT JOIN categories category ON category.id = product.category_id
LEFT JOIN brands brand ON brand.id = product.brand_id
WHERE processed.import_batch_id = 'demo-live-settlement';

INSERT INTO admin.import_batches (
  batch_id, file_name, imported_at, total_rows, matched_orders,
  unmatched_references, unmatched_details, date_range_start, date_range_end
)
SELECT 'demo-live-settlement', 'carrier-settlement-current.xlsx', now(), count(*), count(*),
  '{}', '[]', min(order_created_at)::date, max(order_created_at)::date
FROM admin.processed_orders WHERE import_batch_id = 'demo-live-settlement';

INSERT INTO order_acquisition_attribution (
  order_id, semantics_version, attribution_model, channel, evidence,
  session_channel, session_evidence, source_session_id, referrer_domain,
  session_started_at, landing_path, utm_source, utm_medium, utm_campaign,
  meta_campaign_id, meta_adset_id, meta_ad_id, captured_at
)
SELECT id, 'v1', 'last_non_direct',
  channel, evidence, channel, evidence,
  session_id, CASE channel WHEN 'meta_paid' THEN 'facebook.com'
    WHEN 'google_organic' THEN 'google.com'
    WHEN 'other_referral' THEN 'tools.example.invalid' END,
  created_at - interval '18 minutes',
  CASE WHEN channel = 'meta_paid' THEN '/fr/landing/atelier-mobile' ELSE '/fr/products' END,
  CASE channel WHEN 'meta_paid' THEN 'facebook'
    WHEN 'google_organic' THEN 'google' WHEN 'google_paid' THEN 'google' END,
  CASE WHEN channel IN ('meta_paid', 'google_paid') THEN 'paid'
    WHEN channel = 'google_organic' THEN 'organic' END,
  CASE WHEN channel = 'meta_paid' THEN 'catalogue-atelier'
    WHEN channel = 'google_paid' THEN 'recherche-outillage' END,
  CASE WHEN channel = 'meta_paid' THEN 'campaign-' || (1 + mod(id, 3)) END,
  CASE WHEN channel = 'meta_paid' THEN 'adset-' || (1 + mod(id, 3)) END,
  CASE WHEN channel = 'meta_paid' THEN 'ad-' || (1 + mod(id, 3)) END, created_at
FROM (
  SELECT orders.*, CASE WHEN mod(id, 100) < 38 THEN 'meta_paid'
    WHEN mod(id, 100) < 64 THEN 'google_organic'
    WHEN mod(id, 100) < 85 THEN 'direct_dark_social'
    WHEN mod(id, 100) < 94 THEN 'other_referral' ELSE 'google_paid' END channel,
    CASE WHEN mod(id, 100) < 38 THEN 'paid_utm'
      WHEN mod(id, 100) < 64 THEN 'google_source'
      WHEN mod(id, 100) < 85 THEN 'no_external_referrer'
      WHEN mod(id, 100) < 94 THEN 'external_referrer' ELSE 'paid_utm' END evidence
  FROM orders WHERE mongo_id LIKE 'demo-live-order:%'
) attributed;

INSERT INTO order_ai_influence (
  order_id, semantics_version, level, same_session, source_session_id,
  opened_at, engaged_at, recommendation_clicked_at, clicked_product_ids,
  recommended_product_ordered, captured_at
)
SELECT orders.id, 'v1', 'recommended_product_ordered', true, orders.session_id,
  orders.created_at - interval '14 minutes', orders.created_at - interval '11 minutes',
  orders.created_at - interval '7 minutes', jsonb_build_array(line.product_id), true,
  orders.created_at
FROM orders JOIN LATERAL (
  SELECT product_id FROM order_line_items WHERE order_id = orders.id ORDER BY id LIMIT 1
) line ON true
WHERE orders.mongo_id LIKE 'demo-live-order:%' AND mod(orders.id, 8) = 0;

INSERT INTO analytics_journeys (
  id, first_seen_at, last_seen_at, first_path, last_path, locale, referrer,
  utm_source, utm_medium, utm_campaign, order_count, purchase_count, first_order_id
)
SELECT 'demo-live-journey-' || session_number,
  coalesce(linked_order.created_at - interval '18 minutes', observed_at),
  coalesce(linked_order.created_at, observed_at + interval '12 minutes'),
  '/' || locale || '/products',
  CASE WHEN linked_order.id IS NOT NULL
    THEN '/' || locale || '/thank-you' ELSE '/' || locale || '/products' END,
  locale,
  CASE acquisition.channel WHEN 'meta_paid' THEN 'https://facebook.com/'
    WHEN 'google_organic' THEN 'https://google.com/'
    WHEN 'google_paid' THEN 'https://google.com/'
    WHEN 'other_referral' THEN 'https://tools.example.invalid/' END,
  CASE acquisition.channel WHEN 'meta_paid' THEN 'facebook'
    WHEN 'google_organic' THEN 'google' WHEN 'google_paid' THEN 'google' END,
  CASE acquisition.channel WHEN 'meta_paid' THEN 'paid'
    WHEN 'google_organic' THEN 'organic' WHEN 'google_paid' THEN 'paid' END,
  CASE acquisition.channel WHEN 'meta_paid' THEN 'catalogue-atelier'
    WHEN 'google_paid' THEN 'recherche-outillage' END,
  CASE WHEN linked_order.id IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN linked_order.id IS NOT NULL THEN 1 ELSE 0 END,
  linked_order.id
FROM (
  SELECT session_number,
    CASE WHEN mod(session_number, 3) = 0 THEN 'ar' ELSE 'fr' END locale,
    CASE
      WHEN session_number <= 68040
        AND mod(session_number - 1, 54) = mod(
          (floor((session_number - 1) / 54.0)::integer + 1) * 13,
          54
        ) THEN floor((session_number - 1) / 54.0)::integer + 1
    END linked_order_number,
    now() - interval '15 minutes'
      - (mod(session_number * 13007, 603900)::text || ' seconds')::interval observed_at
  FROM generate_series(1, 68400) session_number
) sessions
LEFT JOIN orders linked_order ON linked_order.mongo_id =
  'demo-live-order:' || linked_order_number
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN linked_order.id IS NOT NULL THEN CASE
      WHEN mod(linked_order.id * 17, 100) < 46 THEN 'meta_paid'
      WHEN mod(linked_order.id * 17, 100) < 69 THEN 'google_organic'
      WHEN mod(linked_order.id * 17, 100) < 85 THEN 'direct_dark_social'
      WHEN mod(linked_order.id * 17, 100) < 93 THEN 'other_referral'
      ELSE 'google_paid' END
    WHEN mod(session_number, 100) < 38 THEN 'meta_paid'
    WHEN mod(session_number, 100) < 64 THEN 'google_organic'
    WHEN mod(session_number, 100) < 85 THEN 'direct_dark_social'
    WHEN mod(session_number, 100) < 94 THEN 'other_referral'
    ELSE 'google_paid' END AS channel
) acquisition;

WITH published_pages AS (
  SELECT id, locale, slug,
    row_number() OVER (PARTITION BY locale ORDER BY id) AS page_number,
    count(*) OVER (PARTITION BY locale) AS page_count
  FROM landing_pages WHERE status = 'published'
), assigned_journeys AS (
  SELECT journey.id, journey.locale,
    CASE
      WHEN journey.order_count > 0 THEN CASE
        WHEN selector < 45 THEN 1 WHEN selector < 75 THEN 2
        WHEN selector < 92 THEN 3 ELSE 4 END
      ELSE CASE
        WHEN selector < 34 THEN 1 WHEN selector < 62 THEN 2
        WHEN selector < 84 THEN 3 ELSE 4 END
    END AS page_number
  FROM analytics_journeys journey
  CROSS JOIN LATERAL (
    SELECT mod(hashtextextended(journey.id, 73) & 2147483647, 100) AS selector
  ) distribution
  WHERE journey.id LIKE 'demo-live-journey-%'
    AND mod(replace(journey.id, 'demo-live-journey-', '')::integer, 5) = 0
)
UPDATE analytics_journeys journey
SET first_path = '/' || page.locale || '/landing/' || page.slug
FROM assigned_journeys assigned
JOIN published_pages page
  ON page.locale::text = assigned.locale AND page.page_number = assigned.page_number
WHERE journey.id = assigned.id;

INSERT INTO analytics_sessions (
  id, journey_id, visit_id, started_at, last_seen_at, entry_path,
  referrer_domain, utm_source, utm_medium, utm_campaign, channel, evidence,
  has_meta_click_id, has_google_click_id, has_tiktok_click_id,
  locale, viewport_class, created_at, updated_at
)
SELECT 'demo-live-session-' || session_number, journey.id,
  'demo-live-visit-' || session_number, journey.first_seen_at,
  journey.last_seen_at, journey.first_path,
  CASE WHEN journey.referrer LIKE '%facebook.com%' THEN 'facebook.com'
    WHEN journey.referrer LIKE '%google.com%' THEN 'google.com'
    WHEN journey.referrer LIKE '%tools.example.invalid%' THEN 'tools.example.invalid' END,
  journey.utm_source, journey.utm_medium, journey.utm_campaign,
  acquisition.channel,
  CASE acquisition.channel WHEN 'meta_paid' THEN 'paid_utm'
    WHEN 'google_organic' THEN 'google_source'
    WHEN 'direct_dark_social' THEN 'no_external_referrer'
    WHEN 'other_referral' THEN 'external_referrer' ELSE 'paid_utm' END,
  acquisition.channel = 'meta_paid', acquisition.channel = 'google_paid', false, journey.locale,
  CASE WHEN mod(session_number, 5) = 0 THEN 'desktop' ELSE 'mobile' END,
  journey.first_seen_at, journey.last_seen_at
FROM (
  SELECT *, replace(id, 'demo-live-journey-', '')::integer session_number
  FROM analytics_journeys WHERE id LIKE 'demo-live-journey-%'
) journey
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN journey.utm_source = 'facebook' AND journey.utm_medium = 'paid' THEN 'meta_paid'
    WHEN journey.utm_source = 'google' AND journey.utm_medium = 'organic' THEN 'google_organic'
    WHEN journey.utm_source = 'google' AND journey.utm_medium = 'paid' THEN 'google_paid'
    WHEN journey.referrer LIKE '%tools.example.invalid%' THEN 'other_referral'
    ELSE 'direct_dark_social' END AS channel
) acquisition;

UPDATE order_acquisition_attribution attribution
SET channel = session.channel,
  evidence = session.evidence,
  session_channel = session.channel,
  session_evidence = session.evidence,
  referrer_domain = session.referrer_domain,
  session_started_at = session.started_at,
  landing_path = session.entry_path,
  utm_source = session.utm_source,
  utm_medium = session.utm_medium,
  utm_campaign = session.utm_campaign,
  meta_campaign_id = CASE WHEN session.channel = 'meta_paid'
    THEN 'campaign-' || (1 + mod(attribution.order_id, 3)) END,
  meta_adset_id = CASE WHEN session.channel = 'meta_paid'
    THEN 'adset-' || (1 + mod(attribution.order_id, 3)) END,
  meta_ad_id = CASE WHEN session.channel = 'meta_paid'
    THEN 'ad-' || (1 + mod(attribution.order_id, 3)) END
FROM analytics_sessions session, orders
WHERE attribution.order_id = orders.id
  AND orders.mongo_id LIKE 'demo-live-order:%'
  AND attribution.source_session_id = session.id;

INSERT INTO analytics_events (
  event_id, visit_id, journey_id, session_id, event_name, ga_event_name,
  page_path, page_type, locale, referrer, utm_source, utm_medium,
  utm_campaign, product_id, product_slug, category_id, category_slug,
  brand_id, brand_slug, order_id, search_term, quantity, value, currency,
  metadata, occurred_at, created_at
)
SELECT 'demo-live-event-' || session_number || '-' || event_number,
  session.visit_id, session.journey_id, session.id,
  CASE event_number WHEN 1 THEN 'page_view' WHEN 2 THEN 'page_view'
    WHEN 3 THEN 'view_item'
    WHEN 4 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 25
      THEN 'add_to_cart' ELSE 'search' END
    WHEN 5 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 12
      THEN 'begin_checkout' ELSE 'page_view' END
    ELSE CASE WHEN linked_order.id IS NOT NULL THEN 'purchase' ELSE 'web_vital' END END,
  CASE event_number WHEN 1 THEN 'page_view' WHEN 2 THEN 'page_view'
    WHEN 3 THEN 'view_item'
    WHEN 4 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 25
      THEN 'add_to_cart' ELSE 'search' END
    WHEN 5 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 12
      THEN 'begin_checkout' ELSE 'page_view' END
    WHEN 6 THEN CASE WHEN linked_order.id IS NOT NULL THEN 'purchase' ELSE 'web_vital' END END,
  CASE event_number WHEN 1 THEN session.entry_path
    WHEN 2 THEN '/' || session.locale || '/products'
    WHEN 3 THEN '/' || session.locale || '/products/' || product.slug
    WHEN 4 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 25
      THEN '/' || session.locale || '/products/' || product.slug
      ELSE '/' || session.locale || '/products' END
    WHEN 5 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 12
      THEN '/' || session.locale || '/checkout'
      ELSE '/' || session.locale || '/products/' || product.slug END
    WHEN 6 THEN CASE WHEN linked_order.id IS NOT NULL
      THEN '/' || session.locale || '/thank-you'
      ELSE '/' || session.locale || '/products/' || product.slug END
    ELSE '/' || session.locale || '/products' END,
  CASE event_number WHEN 1 THEN CASE WHEN session.entry_path LIKE '%landing%' THEN 'landing' ELSE 'catalog' END
    WHEN 2 THEN 'catalog' WHEN 3 THEN 'product'
    WHEN 4 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 25
      THEN 'product' ELSE 'catalog' END
    WHEN 5 THEN CASE WHEN linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 12
      THEN 'checkout' ELSE 'product' END
    WHEN 6 THEN CASE WHEN linked_order.id IS NOT NULL THEN 'thank_you' ELSE 'product' END
    ELSE 'catalog' END,
  session.locale, session.referrer_domain, session.utm_source, session.utm_medium,
  session.utm_campaign,
  CASE WHEN event_number >= 3 THEN product.id END,
  CASE WHEN event_number >= 3 THEN product.slug END,
  CASE WHEN event_number >= 3 THEN product.category_id END,
  CASE WHEN event_number >= 3 THEN category.slug END,
  CASE WHEN event_number >= 3 THEN product.brand_id END,
  CASE WHEN event_number >= 3 THEN brand.slug END,
  CASE WHEN event_number = 6 AND linked_order.id IS NOT NULL THEN linked_order.id END,
  CASE WHEN event_number = 4 AND linked_order.id IS NULL
      AND mod(distribution.selector, 100) >= 25 THEN
    (ARRAY['perceuse sans fil','meuleuse 125 mm','caisse à outils','multimètre numérique','مثقاب لاسلكي'])[1 + mod(session_number, 5)] END,
  CASE WHEN (event_number = 4
      AND (linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 25))
    OR (event_number = 5
      AND (linked_order.id IS NOT NULL OR mod(distribution.selector, 100) < 12))
    OR (event_number = 6 AND linked_order.id IS NOT NULL) THEN 1 END,
  CASE WHEN event_number = 6 AND linked_order.id IS NOT NULL THEN linked_order.total_amount END,
  'DZD',
  jsonb_build_object('storefrontProject','storefront',
    'resultsCount', CASE WHEN event_number = 4 AND linked_order.id IS NULL
      AND mod(distribution.selector, 100) >= 25
      THEN CASE WHEN mod(session_number, 23) = 0 THEN 0 ELSE 18 END END,
    'viewportClass', session.viewport_class,
    'landingPageId', landing.id,
    'landingBlockId', CASE WHEN landing.id IS NOT NULL THEN
      (ARRAY['hero','benefits','final'])[1 + mod(event_number - 1, 3)] END,
    'metricName', CASE WHEN event_number = 6 AND linked_order.id IS NULL THEN
      (ARRAY['LCP','INP','CLS'])[1 + mod(session_number, 3)] END,
    'metricValue', CASE WHEN event_number = 6 AND linked_order.id IS NULL THEN
      CASE mod(session_number, 3)
        WHEN 0 THEN CASE WHEN distribution.vital_roll < 85
          THEN 1100 + mod(session_number * 37, 1400)
          WHEN distribution.vital_roll < 97 THEN 2501 + mod(session_number * 37, 1499)
          ELSE 4001 + mod(session_number * 37, 800) END
        WHEN 1 THEN CASE WHEN distribution.vital_roll < 82
          THEN 70 + mod(session_number * 29, 130)
          WHEN distribution.vital_roll < 97 THEN 201 + mod(session_number * 29, 299)
          ELSE 501 + mod(session_number * 29, 150) END
        ELSE CASE WHEN distribution.vital_roll < 86
          THEN (2 + mod(session_number * 17, 9)) / 100.0
          WHEN distribution.vital_roll < 97 THEN (11 + mod(session_number * 17, 15)) / 100.0
          ELSE (26 + mod(session_number * 17, 9)) / 100.0 END
      END
    END,
    'metricRating', CASE WHEN event_number = 6 AND linked_order.id IS NULL THEN
      CASE WHEN distribution.vital_roll < CASE mod(session_number, 3)
        WHEN 0 THEN 85 WHEN 1 THEN 82 ELSE 86 END THEN 'good'
      WHEN distribution.vital_roll < 97 THEN 'needs-improvement' ELSE 'poor' END
    END),
  CASE WHEN event_number = 6 AND linked_order.id IS NOT NULL
    THEN linked_order.created_at ELSE session.started_at + (event_number * interval '2 minutes') END,
  CASE WHEN event_number = 6 AND linked_order.id IS NOT NULL
    THEN linked_order.created_at ELSE session.started_at + (event_number * interval '2 minutes') END
FROM (
  SELECT *, replace(id, 'demo-live-session-', '')::integer session_number,
    CASE
      WHEN replace(id, 'demo-live-session-', '')::integer <= 68040
        AND mod(replace(id, 'demo-live-session-', '')::integer - 1, 54) = mod(
          (floor((replace(id, 'demo-live-session-', '')::integer - 1) / 54.0)::integer + 1) * 13,
          54
        ) THEN floor((replace(id, 'demo-live-session-', '')::integer - 1) / 54.0)::integer + 1
    END linked_order_number
  FROM analytics_sessions WHERE id LIKE 'demo-live-session-%'
) session
CROSS JOIN generate_series(1, 6) event_number
LEFT JOIN landing_pages landing
  ON session.entry_path = '/' || landing.locale || '/landing/' || landing.slug
CROSS JOIN LATERAL (
  SELECT hashtextextended(session_number::text || ':event', 0) & 2147483647 AS selector,
    mod(hashtextextended(session_number::text || ':vital', 0) & 2147483647, 100)
      AS vital_roll
) distribution
JOIN LATERAL (
  SELECT * FROM products
  WHERE id = coalesce(landing.product_id, CASE
    WHEN mod(distribution.selector, 100) < 12 THEN (
      SELECT product_id FROM demo_runtime.merchandise_product_ids
      WHERE placement = 'top' AND sort_order = 1 + mod(distribution.selector, 4)
    )
    WHEN mod(distribution.selector, 100) < 27 THEN (
      SELECT product_id FROM (
        SELECT product_id, row_number() OVER (ORDER BY placement, sort_order) AS position
        FROM demo_runtime.merchandise_product_ids WHERE placement <> 'top'
      ) featured
      WHERE featured.position = 1 + mod(distribution.selector, 12)
    )
    WHEN mod(distribution.selector, 100) < 62 THEN 1 + mod(distribution.selector, 320)
    ELSE 1 + mod(distribution.selector, (SELECT count(*) FROM products))
  END)
) product ON true
LEFT JOIN categories category ON category.id = product.category_id
LEFT JOIN brands brand ON brand.id = product.brand_id
LEFT JOIN orders linked_order ON linked_order.mongo_id =
  'demo-live-order:' || session.linked_order_number;

-- Keep a bounded raw latency sample alongside compact daily AI rollups. The
-- rollups own counts; these events preserve the distribution needed for P95.
INSERT INTO analytics_events (
  event_id, visit_id, journey_id, session_id, event_name, ga_event_name,
  page_path, page_type, locale, currency, metadata, occurred_at, created_at
)
SELECT 'demo-live-ai-run-' || sample_number, session.visit_id,
  session.journey_id, session.id, 'ai_assistant_run', 'ai_assistant_run',
  '/fr', 'home', session.locale, 'DZD',
  jsonb_build_object(
    'storefrontProject', 'storefront',
    'status', CASE WHEN mod(sample_number, 43) = 0 THEN 'failed' ELSE 'completed' END,
    'intent', (ARRAY[
      'product_discovery', 'comparison', 'project_planning', 'order_help', 'other'
    ])[1 + mod(sample_number * 7, 5)],
    'durationMs', 920 + mod(sample_number * 173, 2480),
    'inputTokens', 420 + mod(sample_number * 29, 760),
    'outputTokens', 110 + mod(sample_number * 31, 360)
  ),
  now() - ((sample_number * 61)::text || ' minutes')::interval,
  now() - ((sample_number * 61)::text || ' minutes')::interval
FROM generate_series(1, 180) sample_number
JOIN analytics_sessions session ON session.id = 'demo-live-session-' || sample_number;

INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, sessions, journeys, page_views,
  product_views, add_to_carts, checkout_starts, purchases, searches,
  zero_result_searches, created_at, updated_at
)
SELECT day::date, 'overall', '', sessions,
  round(sessions * 0.87),
  round(sessions * (2.42 + 0.1 * sin(extract(dow FROM day) * pi() / 3.5))),
  round(sessions * (1.08 + 0.06 * sin(extract(day FROM day) * pi() / 11))),
  round(sessions * (0.113 + 0.008 * sin(extract(day FROM day) * pi() / 7))),
  round(sessions * (0.054 + 0.004 * sin(extract(day FROM day) * pi() / 9))),
  coalesce(orders.orders, 0),
  round(sessions * (0.21 + 0.015 * sin(extract(day FROM day) * pi() / 8))),
  round(sessions * (0.012 + 0.002 * sin(extract(day FROM day) * pi() / 6))),
  now(), now()
FROM (
  SELECT day::date AS day,
    round(9700
      + 520 * sin(extract(dow FROM day) * pi() / 3.5)
      + 280 * sin(extract(doy FROM day) * pi() / 11))::integer AS sessions
  FROM generate_series(current_date - 9, current_date, interval '1 day') day
) traffic
LEFT JOIN (
  SELECT (created_at at time zone 'Africa/Algiers')::date AS day, count(*)::integer orders
  FROM orders WHERE mongo_id LIKE 'demo-live-order:%'
  GROUP BY 1
) orders USING (day);

INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, searches, zero_result_searches,
  created_at, updated_at
)
SELECT overall.day, 'search', term,
  round(overall.searches * demand_share)::integer,
  CASE WHEN can_miss THEN 1 + mod(extract(doy FROM overall.day)::integer, 3) ELSE 0 END,
  now(), now()
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
WHERE overall.dimension = 'overall' AND overall.day >= current_date - 9;

WITH daily AS (
  SELECT day, product_views, add_to_carts, checkout_starts
  FROM analytics_daily_rollups
  WHERE dimension = 'overall' AND day >= current_date - 9
), ranked AS (
  SELECT id,
    row_number() OVER (
      ORDER BY coalesce((
        SELECT merchandise.sort_order
        FROM demo_runtime.merchandise_products merchandise
        WHERE merchandise.placement = 'top'
          AND merchandise.product_key = products.mongo_id
      ), 1000), hashtextextended(mongo_id, 41) DESC, id
    ) AS product_number
  FROM products
), purchases AS (
  SELECT (orders.created_at at time zone 'Africa/Algiers')::date AS day,
    line.product_id, count(DISTINCT orders.id)::integer purchases
  FROM orders
  JOIN order_line_items line ON line.order_id = orders.id
  WHERE orders.mongo_id LIKE 'demo-live-order:%'
    AND orders.created_at >= current_date - interval '8 days'
  GROUP BY 1, 2
), distribution AS (
  SELECT daily.*, product.id, product.product_number,
    coalesce(purchases.purchases, 0) AS purchases,
    1.0 + 20.0 / power(product.product_number, 0.55)
      + power(coalesce(purchases.purchases, 0), 0.72) * 12.0 AS weight
  FROM daily
  CROSS JOIN ranked product
  LEFT JOIN purchases ON purchases.day = daily.day AND purchases.product_id = product.id
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
  purchases, now(), now()
FROM normalized;

INSERT INTO analytics_ai_daily_rollups (
  day, dimension, dimension_key, opens, messages, result_clicks, errors,
  runs, completed, failed, cancelled, helpful, not_helpful, input_tokens,
  output_tokens, total_tokens, duration_ms_total, duration_samples, tool_calls,
  created_at, updated_at
)
SELECT day::date, 'overall', '',
  round(sessions * 0.0052), round(sessions * 0.0074), round(sessions * 0.0022),
  CASE WHEN extract(day FROM day)::integer % 13 = 0 THEN 1 ELSE 0 END,
  round(sessions * 0.0068),
  greatest(0,
    round(sessions * 0.0068)
      - CASE WHEN extract(day FROM day)::integer % 13 = 0 THEN 1 ELSE 0 END
      - CASE WHEN extract(day FROM day)::integer % 29 = 0 THEN 1 ELSE 0 END),
  CASE WHEN extract(day FROM day)::integer % 13 = 0 THEN 1 ELSE 0 END,
  CASE WHEN extract(day FROM day)::integer % 29 = 0 THEN 1 ELSE 0 END,
  round(sessions * 0.00115), round(sessions * 0.00013),
  round(sessions * 0.0068 * 710), round(sessions * 0.0068 * 235),
  round(sessions * 0.0068 * 945), round(sessions * 0.0068 * 1780)::bigint,
  round(sessions * 0.0068), round(sessions * 0.0091), now(), now()
FROM (
  SELECT day,
    round(9700
      + 520 * sin(extract(dow FROM day) * pi() / 3.5)
      + 280 * sin(extract(doy FROM day) * pi() / 11))::integer AS sessions
  FROM generate_series(current_date - 9, current_date, interval '1 day') day
) traffic;

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
  round(overall.total_tokens * share), round(overall.duration_ms_total * share),
  round(overall.duration_samples * share), round(overall.tool_calls * share), now(), now()
FROM analytics_ai_daily_rollups overall
CROSS JOIN (VALUES
  ('product_discovery', 0.36), ('comparison', 0.24), ('project_planning', 0.18),
  ('order_help', 0.14), ('other', 0.08)
) intents(intent, share)
WHERE overall.dimension = 'overall' AND overall.day >= current_date - 9;

INSERT INTO analytics_paid_click_visits (
  visit_id, first_seen_at, last_seen_at, landing_url, landing_path,
  landing_query, landing_host, referrer, user_agent, storefront_variant,
  utm_source, utm_medium, utm_campaign, paid_source, journey_id, session_id,
  order_id, entry_event_id, last_event_name, last_event_at, event_count,
  purchase_count, expires_at, created_at, updated_at
)
SELECT session.visit_id, session.started_at, session.last_seen_at,
  'https://demo.bricomaitre.invalid' || session.entry_path,
  session.entry_path, jsonb_build_object('utm_source', session.utm_source),
  'demo.bricomaitre.invalid', session.referrer_domain,
  'Demo Browser on a constrained mobile connection', 'storefront',
  session.utm_source, session.utm_medium, session.utm_campaign,
  CASE WHEN session.channel = 'meta_paid' THEN 'meta' ELSE 'google' END,
  session.journey_id, session.id, linked_order.id,
  'demo-live-event-' || session_number || '-1',
  CASE WHEN linked_order.id IS NULL THEN 'view_item' ELSE 'purchase' END,
  session.last_seen_at, 6, CASE WHEN linked_order.id IS NULL THEN 0 ELSE 1 END,
  now() + interval '14 days', session.started_at, session.last_seen_at
FROM (
  SELECT *, replace(id, 'demo-live-session-', '')::integer session_number,
    CASE
      WHEN replace(id, 'demo-live-session-', '')::integer <= 68040
        AND mod(replace(id, 'demo-live-session-', '')::integer - 1, 54) = mod(
          (floor((replace(id, 'demo-live-session-', '')::integer - 1) / 54.0)::integer + 1) * 13,
          54
        ) THEN floor((replace(id, 'demo-live-session-', '')::integer - 1) / 54.0)::integer + 1
    END linked_order_number
  FROM analytics_sessions
  WHERE id LIKE 'demo-live-session-%' AND channel IN ('meta_paid','google_paid')
) session
LEFT JOIN orders linked_order ON linked_order.mongo_id =
  'demo-live-order:' || session.linked_order_number;

INSERT INTO order_meta_attribution (
  order_id, semantics_version, lead_event_id, event_source_url,
  fbc, fbp, external_id_source, expires_at, created_at, updated_at
)
SELECT id, 'v1', 'demo-lead-' || id,
  'https://demo.bricomaitre.invalid/fr/checkout',
  'fb.1.demo.' || id, 'fb.1.browser.' || id, 'normalized_phone',
  now() + interval '90 days', created_at, updated_at
FROM orders WHERE mongo_id LIKE 'demo-live-order:%' AND mod(id, 3) = 0;

INSERT INTO order_marketing_attribution (
  order_id, semantics_version, event_id, event_source_url,
  google_client_id, google_session_id, gclid, expires_at, created_at, updated_at
)
SELECT id, 'v1', 'demo-marketing-' || id,
  'https://demo.bricomaitre.invalid/fr/checkout',
  'demo-client-' || id, 'demo-session-' || id, 'demo-click-' || id,
  now() + interval '90 days', created_at, updated_at
FROM orders WHERE mongo_id LIKE 'demo-live-order:%' AND mod(id, 5) = 0;

INSERT INTO meta_event_outbox (
  event_name, event_id, source, order_id, event_time, event_source_url,
  user_data, custom_data, match_key_summary, status, attempt_count,
  next_attempt_at, last_attempt_at, delivered_at, last_http_status,
  fbtrace_id, events_received, created_at, updated_at
)
SELECT event_name, 'demo-live-meta-' || event_name || '-' || orders.id,
  'order', orders.id, least(now(), orders.created_at + event_offset),
  'https://demo.bricomaitre.invalid/fr/checkout',
  jsonb_build_object('external_id', md5(orders.normalized_phone)),
  jsonb_build_object('currency','DZD','value',orders.total_amount,'num_items',4),
  '["external_id"]', CASE WHEN mod(orders.id, 37) = 0 THEN 'retryable' ELSE 'delivered' END,
  CASE WHEN mod(orders.id, 37) = 0 THEN 2 ELSE 1 END, now(),
  least(now(), orders.created_at + event_offset + interval '2 seconds'),
  CASE WHEN mod(orders.id, 37) <> 0
    THEN least(now(), orders.created_at + event_offset + interval '2 seconds') END,
  CASE WHEN mod(orders.id, 37) = 0 THEN 503 ELSE 200 END,
  CASE WHEN mod(orders.id, 37) <> 0 THEN 'demo-trace-' || orders.id END,
  CASE WHEN mod(orders.id, 37) <> 0 THEN 1 END,
  least(now(), orders.created_at + event_offset),
  least(now(), orders.created_at + event_offset + interval '2 seconds')
FROM orders CROSS JOIN (VALUES ('Lead', interval '1 minute'), ('Purchase', interval '4 days')) events(event_name, event_offset)
WHERE orders.mongo_id LIKE 'demo-live-order:%'
  AND (event_name = 'Lead' OR orders.confirmed IN (4, 10));

INSERT INTO marketing_event_outbox (
  destination, event_name, event_id, source, order_id, event_time, payload,
  status, attempt_count, next_attempt_at, last_attempt_at, delivered_at,
  last_http_status, provider_request_id, response_summary, created_at, updated_at
)
SELECT destination, 'purchase', 'demo-live-' || destination || '-' || orders.id,
  'order', orders.id, orders.created_at + interval '4 days',
  jsonb_build_object('currency','DZD','value',orders.total_amount),
  CASE WHEN mod(orders.id, 43) = 0 THEN 'retryable' ELSE 'delivered' END,
  CASE WHEN mod(orders.id, 43) = 0 THEN 2 ELSE 1 END, now(),
  orders.created_at + interval '4 days 2 seconds',
  CASE WHEN mod(orders.id, 43) <> 0 THEN orders.created_at + interval '4 days 2 seconds' END,
  CASE WHEN mod(orders.id, 43) = 0 THEN 503 ELSE 204 END,
  CASE WHEN mod(orders.id, 43) <> 0 THEN 'demo-' || destination || '-' || orders.id END,
  jsonb_build_object('synthetic', true),
  orders.created_at + interval '4 days', orders.created_at + interval '4 days 2 seconds'
FROM orders CROSS JOIN unnest(ARRAY['google','tiktok']) destination
WHERE orders.mongo_id LIKE 'demo-live-order:%' AND orders.confirmed IN (4, 10);

INSERT INTO meta_worker_heartbeat (
  worker_key, release, last_heartbeat_at, last_successful_drain_at,
  last_reconciliation_at, last_reconciliation_result, updated_at
)
VALUES ('storefront-meta-worker', 'demo', now(), now() - interval '20 seconds',
  now() - interval '2 minutes', '{"status":"healthy","synthetic":true}', now())
ON CONFLICT (worker_key) DO UPDATE SET
  release = EXCLUDED.release,
  last_heartbeat_at = EXCLUDED.last_heartbeat_at,
  last_successful_drain_at = EXCLUDED.last_successful_drain_at,
  last_reconciliation_at = EXCLUDED.last_reconciliation_at,
  last_reconciliation_result = EXCLUDED.last_reconciliation_result,
  updated_at = EXCLUDED.updated_at;

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
  'OUTCOME_SALES', '7d_click,1d_view', 'conversion', '["7d_click","1d_view"]',
  990 + campaign_number * 165 + mod(extract(doy FROM day)::integer, 9) * 15,
  215000 + campaign_number * 48000
    + mod(extract(doy FROM day)::integer * 1061, 27000),
  164000 + campaign_number * 36000,
  4800 + campaign_number * 710, 4100 + campaign_number * 620,
  3720 + campaign_number * 560, 3380 + campaign_number * 510,
  3100 + campaign_number * 460, 125 + campaign_number * 28,
  52 + campaign_number * 13, 21 + campaign_number * 7,
  18 + campaign_number * 2 + mod(extract(doy FROM day)::integer + campaign_number, 6),
  (18 + campaign_number * 2
    + mod(extract(doy FROM day)::integer + campaign_number, 6)) * 450,
  104000 + campaign_number * 14000, 67000, 45000, 29000, 16500, 9800, 8.4,
  'ABOVE_AVERAGE', 'ABOVE_AVERAGE', 'AVERAGE', now()
FROM generate_series(current_date - 9, current_date, interval '1 day') day
CROSS JOIN generate_series(1, 3) campaign_number;

INSERT INTO search_console_daily_totals (
  day, search_type, clicks, impressions, ctr, position, data_state, synced_at
)
SELECT overall.day, 'web', metrics.clicks, metrics.impressions,
  metrics.clicks::numeric / metrics.impressions,
  7.05 + 0.12 * sin(extract(doy FROM overall.day) * pi() / 29),
  CASE WHEN overall.day >= current_date - 2 THEN 'fresh' ELSE 'final' END, now()
FROM analytics_daily_rollups overall
CROSS JOIN LATERAL (
  SELECT round(overall.sessions * (
      0.0047 + 0.00025 * sin(extract(doy FROM overall.day) * pi() / 41)
    ))::integer clicks,
    round(overall.sessions * (
      0.108 + 0.004 * sin(extract(doy FROM overall.day) * pi() / 53)
    ))::integer impressions
) metrics
WHERE overall.dimension = 'overall' AND overall.day >= current_date - 9;

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
  WHERE total.day >= current_date - 9
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
  'https://demo.bricomaitre.invalid/fr/products/' || slug, 'dza', device,
  row_clicks, row_impressions, row_clicks::numeric / nullif(row_impressions, 0),
  greatest(1, base_position - 0.15
    + 0.12 * sin(extract(doy FROM day) * pi() / 29)), now()
FROM reconciled;

INSERT INTO search_console_daily_appearances (
  day, search_type, appearance, clicks, impressions, ctr, position, synced_at
)
SELECT day, 'web', appearance, round(clicks * 0.18), round(impressions * 0.22),
  ctr, position - 0.4, now()
FROM search_console_daily_totals
CROSS JOIN unnest(ARRAY['product_snippet','merchant_listing']) appearance
WHERE day >= current_date - 9;

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
  insight.purchases * breakdown.share, insight.purchase_value * breakdown.share, now()
FROM meta_ads_daily_insights insight
CROSS JOIN (VALUES
  ('placement', 'facebook', 0.48), ('placement', 'instagram', 0.52),
  ('device', 'mobile_app', 0.82), ('device', 'desktop', 0.18),
  ('region', 'Alger', 0.31), ('region', 'Oran', 0.18),
  ('region', 'Sétif', 0.14), ('region', 'Constantine', 0.13), ('region', 'Other', 0.24)
) breakdown(kind, label, share)
WHERE insight.day >= current_date - 9;

INSERT INTO admin.ad_spend_import_batches (
  batch_id, file_name, rate, total_rows, imported_rows, updated_rows,
  uploaded_by_email, uploaded_by_name, imported_at
)
VALUES ('ads-demo-current', 'campaign-spend-current.csv', 150, 30, 30, 0,
  'operator@demo.bricomaitre.invalid', 'Nadia Benali', now());

INSERT INTO admin.ad_costs (
  date, platform, campaign_name, campaign_id, spend, impressions, clicks,
  conversions, reach, notes, import_batch_id, created_at, updated_at
)
SELECT day, 'facebook', campaign_name, campaign_id, spend,
  impressions::integer, clicks::integer, purchases::integer, reach::integer,
  'Current reset-relative provider data.', 'ads-demo-current', now(), now()
FROM meta_ads_daily_insights WHERE day >= current_date - 9;

INSERT INTO admin.profit_tracker_days (
  day, spend_eur, fb_purchases, cpm, ctr, link_clicks, landing_page_views,
  fx_rate_used, meta_synced_at, created_at, updated_at
)
SELECT day, sum(spend), sum(purchases),
  sum(spend) * 1000 / nullif(sum(impressions), 0),
  sum(clicks) * 100 / nullif(sum(impressions), 0), sum(clicks),
  sum(landing_page_views), 150, now(), now(), now()
FROM meta_ads_daily_insights WHERE day >= current_date - 9 GROUP BY day;

INSERT INTO admin.analytics_order_cohort_facts (
  order_id, posted_day, delivered_at, paid_at, outcome, submitted_cod_dzd,
  current_cod_dzd, delivery_fee_dzd, product_cost_dzd, gross_profit_dzd,
  automatic_paid_profit_dzd, cost_complete, wilaya_id, commune,
  delivery_mode, attempt_count, meta_campaign_id, meta_adset_id, meta_ad_id,
  semantics_version, refreshed_at
)
SELECT orders.id, least(now(), orders.created_at + interval '2 hours')::date,
  CASE WHEN orders.confirmed IN (4, 10) THEN least(now(), orders.created_at + interval '3 days') END,
  CASE WHEN orders.confirmed = 4 THEN least(now(), orders.created_at + interval '4 days') END,
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
JOIN live_shipped_orders shipped ON shipped.order_id = orders.id
JOIN order_acquisition_attribution attribution ON attribution.order_id = orders.id
JOIN LATERAL (
  SELECT sum(coalesce(unit_purchase_price_snapshot, 0) * quantity) product_cost
  FROM order_line_items WHERE order_id = orders.id
) costs ON true;

DELETE FROM admin.analytics_economics_daily_facts
WHERE day IN (
  SELECT DISTINCT posted_day
  FROM admin.analytics_order_cohort_facts
  WHERE order_id IN (SELECT order_id FROM live_shipped_orders)
);

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
  coalesce(sum(cohort.gross_profit_dzd), 0),
  coalesce(sum(cohort.gross_profit_dzd), 0) * 0.865,
  coalesce(max(day_cost.spend_eur), 0) * 150, 900,
  coalesce(sum(cohort.gross_profit_dzd), 0) * 0.865
    - coalesce(max(day_cost.spend_eur), 0) * 150 - 900,
  coalesce(sum(cohort.gross_profit_dzd), 0) * 0.865
    - coalesce(max(day_cost.spend_eur), 0) * 150 - 900,
  coalesce(sum(cohort.current_cod_dzd) FILTER (WHERE outcome IN ('paye_et_archive', 'payed')), 0),
  coalesce(sum(cohort.delivery_fee_dzd) FILTER (WHERE outcome IN ('paye_et_archive', 'payed')), 0),
  coalesce(sum(cohort.automatic_paid_profit_dzd), 0), 150, 13.5, 1, now()
FROM admin.analytics_order_cohort_facts cohort
LEFT JOIN admin.profit_tracker_days day_cost ON day_cost.day = cohort.posted_day
WHERE cohort.posted_day IN (
  SELECT DISTINCT posted_day
  FROM admin.analytics_order_cohort_facts
  WHERE order_id IN (SELECT order_id FROM live_shipped_orders)
)
GROUP BY cohort.posted_day;

INSERT INTO admin.analytics_economics_daily_facts (
  day, posted_orders, paid_orders, cost_complete_orders,
  paid_profit_complete_orders, gross_profit_dzd, adjusted_profit_dzd,
  ad_cost_dzd, operating_cost_dzd, net_profit_dzd, true_profit_dzd,
  automatic_paid_cod_dzd, automatic_paid_fees_dzd,
  automatic_paid_profit_dzd, fx_rate_used, planning_return_rate_pct,
  semantics_version, refreshed_at
)
SELECT tracker.day, 0, 0, 0, 0, 0, 0,
  coalesce(tracker.spend_eur, 0) * coalesce(tracker.fx_rate_used, 150), 900,
  -coalesce(tracker.spend_eur, 0) * coalesce(tracker.fx_rate_used, 150),
  -coalesce(tracker.spend_eur, 0) * coalesce(tracker.fx_rate_used, 150) - 900,
  0, 0, 0, coalesce(tracker.fx_rate_used, 150),
  coalesce(tracker.return_rate_pct, 13.5), 1, now()
FROM admin.profit_tracker_days tracker
WHERE tracker.day <= current_date - 1
ON CONFLICT (day) DO NOTHING;

UPDATE admin.analytics_economics_daily_facts SET refreshed_at = now();

INSERT INTO admin.ecotrack_sync_runs (
  trigger, status, request_count, wilaya_count, commune_count,
  service_fee_count, weight_fee_count, rate_limit_snapshot, started_at, finished_at
)
VALUES ('demo-reset', 'succeeded', 7, 58, 1541, 290, 4,
  '{"remaining":993,"source":"deterministic-mock"}', now() - interval '3 seconds', now());

INSERT INTO meta_ads_sync_runs (
  trigger, status, api_version, account_id, account_currency, account_timezone,
  since_day, until_day, pages_fetched, rows_fetched, rows_upserted, usage,
  started_at, completed_at
)
VALUES ('demo-reset', 'succeeded', 'v25.0', 'demo-account', 'EUR', 'Africa/Algiers',
  current_date - 9, current_date, 3, 30, 30,
  '{"call_count":3,"deterministic":true}', now() - interval '5 seconds', now());

INSERT INTO search_console_sync_runs (
  trigger, status, site_url, since_day, until_day, totals_fetched,
  detail_rows_fetched, appearances_fetched, urls_inspected, started_at, completed_at
)
VALUES ('demo-reset', 'succeeded', 'sc-domain:demo.bricomaitre.invalid',
  current_date - 9, current_date, 10, 80, 20, 12,
  now() - interval '8 seconds', now());

UPDATE meta_ads_delivery_entities SET synced_at = now(), updated_at = now();
UPDATE search_console_sitemaps SET last_submitted_at = now() - interval '1 day',
  last_downloaded_at = now(), synced_at = now(), updated_at = now();

INSERT INTO admin.action_logs (
  resource, entity_type, entity_id, entity_label, operation,
  before_state, after_state, created_by, created_by_name,
  is_reversible, created_at, updated_at
)
SELECT 'orders', 'order', orders.id, 'Commande ' || orders.ecotrack_reference,
  'status_change', jsonb_build_object('status', 2),
  jsonb_build_object('status', orders.confirmed),
  orders.confirmed_by, orders.confirmed_by_name, true,
  orders.updated_at, orders.updated_at
FROM orders
WHERE mongo_id LIKE 'demo-live-order:%' AND confirmed NOT IN (0, 1, 2, 6)
ORDER BY updated_at DESC LIMIT 320;

INSERT INTO ai_conversations (
  surface, actor_id, session_key, title, created_at, updated_at
)
VALUES ('admin', 'operator@demo.bricomaitre.invalid', 'demo-showcase-current',
  'Préparer les commandes confirmées et signaler les risques de stock',
  now() - interval '14 minutes', now() - interval '2 minutes');

WITH showcase AS (
  SELECT id FROM ai_conversations WHERE session_key = 'demo-showcase-current'
)
INSERT INTO ai_messages (conversation_id, role, content, created_at)
SELECT showcase.id, message.role, message.content, now() + message.time_offset
FROM showcase CROSS JOIN (VALUES
  ('user', jsonb_build_object('text', 'Prépare le prochain lot de commandes confirmées. Vérifie le stock, regroupe les besoins et signale ce qui risque de bloquer l’expédition.'), interval '-14 minutes'),
  ('assistant', jsonb_build_object(
    'text', 'J’ai analysé les commandes confirmées, les lignes produit et le stock disponible. Le lot peut avancer, avec trois références à réapprovisionner avant impression des étiquettes. J’ai préparé une liste d’achat regroupée et laissé les commandes concernées inchangées pour validation.',
    'toolResults', jsonb_build_array(
      jsonb_build_object('toolName','inspect_orders','status','completed','output',jsonb_build_object('confirmed',160,'ready',143,'blocked',17)),
      jsonb_build_object('toolName','inspect_inventory','status','completed','output',jsonb_build_object('productsChecked',412,'shortages',3)),
      jsonb_build_object('toolName','save_order_shopping_list','status','completed','output',jsonb_build_object('items',18,'scope','confirmed'))),
    'feedback', 'helpful'), interval '-2 minutes')
) message(role, content, time_offset);

WITH showcase AS (
  SELECT id FROM ai_conversations WHERE session_key = 'demo-showcase-current'
)
INSERT INTO ai_runs (
  conversation_id, surface, task, status, model, prompt_version, actor_id,
  input_tokens, output_tokens, total_tokens, started_at, completed_at
)
SELECT id, 'admin', 'admin_chat', 'completed', 'openai/gpt-5.6-luna', 'demo-v1',
  'operator@demo.bricomaitre.invalid', 1840, 612, 2452,
  now() - interval '2 minutes 8 seconds', now() - interval '2 minutes'
FROM showcase;

INSERT INTO ai_tool_calls (
  run_id, tool_name, status, input, output, started_at, completed_at
)
SELECT run.id, tool_name, 'completed', jsonb_build_object('scope','confirmed'), output,
  run.started_at + sequence * interval '2 seconds',
  run.started_at + sequence * interval '2 seconds 500 milliseconds'
FROM ai_runs run CROSS JOIN (VALUES
  (1, 'inspect_orders', '{"confirmed":160,"ready":143,"blocked":17}'::jsonb),
  (2, 'inspect_inventory', '{"productsChecked":412,"shortages":3}'::jsonb),
  (3, 'save_order_shopping_list', '{"items":18,"scope":"confirmed"}'::jsonb)
) tools(sequence, tool_name, output)
WHERE run.conversation_id = (
  SELECT id FROM ai_conversations WHERE session_key = 'demo-showcase-current'
);
