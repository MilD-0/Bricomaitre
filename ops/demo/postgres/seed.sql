\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS demo_runtime;
CREATE TABLE IF NOT EXISTS demo_runtime.initialization (
  id integer PRIMARY KEY CHECK (id = 1),
  seeded_at timestamptz NOT NULL
);

DO $$
DECLARE
  targets text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
  INTO targets
  FROM pg_tables
  WHERE schemaname IN ('public', 'admin');

  IF targets IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || targets || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

INSERT INTO admin.role_definitions (name, slug, description, is_system)
VALUES
  ('Viewer', 'viewer', 'Read-only access to the commerce workspace.', true),
  ('Operations', 'operations', 'Order and fulfilment work without system administration.', false),
  ('Developer', 'developer', 'Full access to this isolated demonstration.', true);

INSERT INTO admin.role_definition_permissions (role_id, permission)
SELECT role.id, permission::admin.admin_role_permission
FROM admin.role_definitions role
CROSS JOIN unnest(ARRAY[
  'products_write', 'orders_write', 'assets_write', 'brands_categories_write',
  'bulletin_moderate', 'ops_view', 'analytics_manage', 'settings_manage'
]) permission
WHERE role.slug = 'developer';

INSERT INTO admin.role_definition_permissions (role_id, permission)
SELECT role.id, permission::admin.admin_role_permission
FROM admin.role_definitions role
CROSS JOIN unnest(ARRAY['orders_write', 'ops_view']) permission
WHERE role.slug = 'operations';

INSERT INTO brands (
  name, slug, image, featured, view_count, add_to_cart_count, checkout_count,
  purchase_count, popularity_score, conversion_rate
)
VALUES
  ('Forge', 'forge', :'asset_origin' || '/bricomaitre-demo/products/toolbox.svg', true, 12600, 940, 410, 260, 88.4, 2.0635),
  ('Aster', 'aster', :'asset_origin' || '/bricomaitre-demo/products/drill.svg', true, 9800, 810, 360, 214, 81.2, 2.1837),
  ('Nord', 'nord', :'asset_origin' || '/bricomaitre-demo/products/saw.svg', true, 7600, 570, 245, 149, 72.5, 1.9605),
  ('Volt', 'volt', :'asset_origin' || '/bricomaitre-demo/products/welder.svg', false, 4300, 302, 144, 86, 61.7, 2.0000);

INSERT INTO categories (
  name, name_en, name_ar, slug, image, featured, properties, view_count,
  add_to_cart_count, checkout_count, purchase_count, popularity_score, conversion_rate
)
VALUES
  ('Outillage électroportatif', 'Power tools', 'أدوات كهربائية', 'outillage-electroportatif', :'asset_origin' || '/bricomaitre-demo/products/drill.svg', true, '[{"name":"Tension","type":"text"}]', 14400, 1100, 490, 310, 92.5, 2.1528),
  ('Découpe', 'Cutting', 'أدوات القطع', 'decoupe', :'asset_origin' || '/bricomaitre-demo/products/saw.svg', true, '[{"name":"Diamètre","type":"text"}]', 9100, 680, 301, 188, 76.2, 2.0659),
  ('Soudage', 'Welding', 'معدات اللحام', 'soudage', :'asset_origin' || '/bricomaitre-demo/products/welder.svg', false, '[]', 6200, 430, 191, 114, 66.1, 1.8387),
  ('Rangement', 'Storage', 'التخزين', 'rangement', :'asset_origin' || '/bricomaitre-demo/products/toolbox.svg', false, '[]', 4800, 330, 142, 92, 59.8, 1.9167);

WITH product_seed(title, title_ar, slug, sku, price, old_price, purchase_price, brand_id, category_id, image, stock, sold, views) AS (
  VALUES
    ('Perceuse-visseuse 20 V', 'مثقاب لاسلكي 20 فولت', 'perceuse-visseuse-20v', 'DEMO-DRL-20', 12900, 14900, 7600, 2, 1, 'drill.svg', 34, 128, 3800),
    ('Boulonneuse 550 Nm', 'مفتاح صدمات 550 نيوتن', 'boulonneuse-550nm', 'DEMO-IMP-550', 15800, 17900, 9200, 1, 1, 'drill.svg', 21, 94, 3200),
    ('Meuleuse 125 mm', 'جلاخة زاوية 125 مم', 'meuleuse-125mm', 'DEMO-GRD-125', 8900, 9900, 5100, 1, 2, 'saw.svg', 47, 173, 4400),
    ('Scie circulaire 185 mm', 'منشار دائري 185 مم', 'scie-circulaire-185mm', 'DEMO-SAW-185', 13900, 15900, 8100, 3, 2, 'saw.svg', 18, 87, 2700),
    ('Poste à souder inverter', 'آلة لحام إنفرتر', 'poste-souder-inverter', 'DEMO-WLD-200', 22400, 24900, 14100, 4, 3, 'welder.svg', 12, 61, 2100),
    ('Découpeur plasma compact', 'قاطع بلازما مدمج', 'decoupeur-plasma-compact', 'DEMO-PLS-40', 36500, 39900, 23800, 4, 3, 'welder.svg', 7, 28, 1300),
    ('Coffret 108 pièces', 'حقيبة أدوات 108 قطعة', 'coffret-108-pieces', 'DEMO-SET-108', 11800, 13500, 6900, 1, 4, 'toolbox.svg', 26, 143, 3600),
    ('Servante atelier 5 tiroirs', 'عربة ورشة 5 أدراج', 'servante-atelier-5-tiroirs', 'DEMO-CAB-05', 42800, NULL, 28600, 3, 4, 'toolbox.svg', 5, 19, 980),
    ('Marteau perforateur 1500 W', 'مطرقة ثاقبة 1500 واط', 'marteau-perforateur-1500w', 'DEMO-HMR-15', 17600, 19900, 10400, 2, 1, 'drill.svg', 23, 76, 2400),
    ('Scie sauteuse pendulaire', 'منشار أركت بندولي', 'scie-sauteuse-pendulaire', 'DEMO-JIG-08', 9800, 11200, 5700, 3, 2, 'saw.svg', 31, 105, 2900),
    ('Masque de soudage auto', 'قناع لحام أوتوماتيكي', 'masque-soudage-auto', 'DEMO-MSK-01', 7200, 8100, 3900, 4, 3, 'welder.svg', 42, 117, 3100),
    ('Sac à outils renforcé', 'حقيبة أدوات مقواة', 'sac-outils-renforce', 'DEMO-BAG-18', 6400, NULL, 3500, 1, 4, 'toolbox.svg', 55, 201, 5100)
)
INSERT INTO products (
  title, title_ar, slug, sku, description, description_ar, price, old_price,
  purchase_price, brand_id, category_id, images, inventory_quantity, units_sold,
  view_count, add_to_cart_count, checkout_count, purchase_count, popularity_score,
  conversion_rate, active, in_stock, availability_status
)
SELECT
  title, title_ar, slug, sku,
  'Produit synthétique conçu pour parcourir toutes les fonctions de la démonstration sans reprendre le catalogue réel.',
  'منتج اصطناعي مخصص لاستكشاف جميع وظائف النسخة التجريبية دون استخدام بيانات المتجر الحقيقية.',
  price, old_price, purchase_price, brand_id, category_id,
  ARRAY[:'asset_origin' || '/bricomaitre-demo/products/' || image],
  stock, sold, views, (views * 0.08)::bigint, (views * 0.035)::bigint, sold,
  round((views / 50.0)::numeric, 2), round((sold * 100.0 / views)::numeric, 4),
  true, true, 'in_stock'
FROM product_seed;

INSERT INTO product_cards (
  product_id, title_ar, title_fr, description_ar, description_fr,
  characteristics_ar, characteristics_fr, sort_order
)
SELECT
  id, title_ar, title,
  'اختيار عملي للورشة مع معلومات تجريبية واضحة.',
  'Un choix pratique pour l’atelier, présenté avec des données de démonstration.',
  ARRAY['ضمان تجريبي', 'جاهز للطلب'],
  ARRAY['Garantie de démonstration', 'Prêt à commander'], id
FROM products
WHERE id <= 6;

INSERT INTO featured_product_groups (
  name, name_ar, cta, cta_ar, link, sort_order, show_at_top_of_products_page, active
)
VALUES
  ('Les essentiels de l’atelier', 'أساسيات الورشة', 'Voir la sélection', 'عرض التشكيلة', '/fr/products', 1, true, true),
  ('Équipement sans fil', 'معدات لاسلكية', 'Explorer', 'استكشف', '/fr/categories/outillage-electroportatif', 2, false, true);

INSERT INTO featured_product_group_products (group_id, product_id)
SELECT 1, id FROM products WHERE id IN (1, 2, 3, 7, 9, 12);

INSERT INTO featured_product_group_categories (group_id, category_id) VALUES (2, 1);

INSERT INTO asset_banners (
  title, title_ar, image_url, image_url_portrait, image_url_landscape,
  product_id, sort_order, active
)
VALUES (
  'L’atelier, bien équipé', 'ورشة مجهزة جيداً',
  :'asset_origin' || '/bricomaitre-demo/banners/workshop.svg',
  :'asset_origin' || '/bricomaitre-demo/banners/workshop.svg',
  :'asset_origin' || '/bricomaitre-demo/banners/workshop.svg', 1, 1, true
);

INSERT INTO storefront_announcements (locale, message, active)
VALUES
  ('fr', 'Démonstration publique avec données entièrement synthétiques.', true),
  ('ar', 'نسخة تجريبية عامة ببيانات اصطناعية بالكامل.', true),
  ('en', 'Public demo with fully synthetic data.', true);

INSERT INTO storefront_settings (
  id, contact_phone, phone_enabled, contact_email, address, ai_assistant_enabled, ai_model
)
VALUES (
  1, '0550000000', true, 'contact@demo.bricomaitre.invalid',
  'Adresse de démonstration, Algérie', false, 'disabled'
);

INSERT INTO admin.ecotrack_wilayas (wilaya_id, name)
VALUES (9, 'Blida'), (16, 'Alger'), (19, 'Sétif'), (25, 'Constantine'), (31, 'Oran');

INSERT INTO admin.ecotrack_communes (
  commune_id, wilaya_id, name, postal_code, has_stop_desk
)
VALUES
  (901, 9, 'Blida', '09000', true),
  (1601, 16, 'Alger Centre', '16000', true),
  (1602, 16, 'Bab Ezzouar', '16042', true),
  (1901, 19, 'Sétif', '19000', true),
  (2501, 25, 'Constantine', '25000', true),
  (3101, 31, 'Oran', '31000', true);

INSERT INTO admin.ecotrack_service_fees (
  service_type, wilaya_id, home_fee, stop_desk_fee
)
SELECT service_type, wilaya_id, home_fee, stop_desk_fee
FROM (VALUES
  (9, 550, 400), (16, 500, 350), (19, 750, 500),
  (25, 750, 500), (31, 800, 550)
) fee(wilaya_id, home_fee, stop_desk_fee)
CROSS JOIN unnest(ARRAY['livraison', 'pickup', 'echange', 'recouvrement', 'retours']) service_type;

INSERT INTO admin.ecotrack_weight_fees (
  service_type, home_surcharge, stop_desk_surcharge, per_additional_kg, starts_at_kg
)
SELECT service_type, 100, 100, 50, 5
FROM unnest(ARRAY['livraison', 'pickup', 'echange', 'recouvrement']) service_type;

INSERT INTO admin.ecotrack_sync_runs (
  trigger, status, request_count, wilaya_count, commune_count, service_fee_count,
  weight_fee_count, started_at, finished_at
)
VALUES (
  'demo-seed', 'succeeded', 3, 5, 6, 25, 4,
  now() - interval '3 minutes', now() - interval '2 minutes'
);

WITH generated AS (
  SELECT
    i,
    ((i - 1) % 12) + 1 AS product_id,
    CASE
      WHEN i <= 12 THEN (ARRAY[0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2])[i]
      WHEN i % 11 = 0 THEN 6
      WHEN i % 9 = 0 THEN 8
      WHEN i % 5 = 0 THEN 7
      WHEN i % 4 = 0 THEN 11
      ELSE 4
    END AS status,
    (ARRAY[9, 16, 19, 25, 31])[1 + ((i - 1) % 5)] AS wilaya_id,
    (ARRAY['Blida', 'Alger Centre', 'Sétif', 'Constantine', 'Oran'])[1 + ((i - 1) % 5)] AS commune,
    now() - ((i % 60)::text || ' days')::interval
      - ((i % 19)::text || ' minutes')::interval AS ordered_at
  FROM generate_series(1, 96) i
), priced AS (
  SELECT generated.*, products.title, products.price AS unit_price
  FROM generated
  JOIN products ON products.id = generated.product_id
)
INSERT INTO orders (
  first_name, last_name, state, city, home_address, email, phone_number_1,
  normalized_phone, public_token, public_token_expires_at, cart_products,
  visit_id, journey_id, session_id, variant, delivery, del_pr, product_subtotal,
  total_amount, price, confirmed, no_answer_count, confirmed_by,
  confirmed_by_name, confirmed_at, ecotrack_status, ecotrack_status_last_update,
  ecotrack_reference, ecotrack_tracking_number, created_at, updated_at
)
SELECT
  'Client', 'démo ' || lpad(i::text, 3, '0'), wilaya_id, commune,
  'Adresse synthétique ' || lpad(i::text, 3, '0'), NULL,
  '0000000000', '0000000000', 'demo-order-' || lpad(i::text, 3, '0'),
  now() + interval '30 days', ARRAY['demo-product-' || product_id],
  'demo-visit-' || i, 'demo-journey-' || i, 'demo-session-' || i, 'storefront',
  CASE WHEN i % 4 = 0 THEN 1 ELSE 0 END,
  CASE wilaya_id WHEN 16 THEN 500 WHEN 9 THEN 550 WHEN 31 THEN 800 ELSE 750 END,
  unit_price,
  unit_price + CASE wilaya_id WHEN 16 THEN 500 WHEN 9 THEN 550 WHEN 31 THEN 800 ELSE 750 END,
  unit_price + CASE wilaya_id WHEN 16 THEN 500 WHEN 9 THEN 550 WHEN 31 THEN 800 ELSE 750 END,
  status, CASE WHEN status = 1 THEN 1 ELSE 0 END,
  CASE WHEN status >= 2 THEN 'operator@demo.bricomaitre.invalid' ELSE NULL END,
  CASE WHEN status >= 2 THEN 'Demo Operator' ELSE NULL END,
  CASE WHEN status >= 2 THEN ordered_at + interval '25 minutes' ELSE NULL END,
  CASE status
    WHEN 11 THEN 'en_preparation' WHEN 7 THEN 'en_livraison'
    WHEN 4 THEN 'payed' WHEN 8 THEN 'retour_archive' ELSE NULL
  END,
  CASE WHEN status IN (11, 7, 4, 8) THEN ordered_at + interval '3 days' ELSE NULL END,
  CASE WHEN status IN (11, 7, 4, 8) THEN i::text ELSE NULL END,
  CASE WHEN status IN (11, 7, 4, 8)
    THEN (CASE WHEN i % 2 = 0 THEN 'DLD' ELSE 'EMD' END) || lpad(i::text, 8, '0')
    ELSE NULL
  END,
  ordered_at, ordered_at + interval '30 minutes'
FROM priced;

INSERT INTO order_line_items (
  order_id, product_id, content_id, raw_value, title_snapshot,
  original_unit_price, effective_unit_price, unit_purchase_price_snapshot,
  purchase_cost_source, quantity, discount_amount, line_total, thumbnail_url,
  created_at, updated_at
)
SELECT
  orders.id, products.id, 'demo-line-' || orders.id, products.slug, products.title,
  products.price, products.price, products.purchase_price, 'order_snapshot', 1, 0,
  products.price, products.images[1], orders.created_at, orders.updated_at
FROM orders
JOIN products ON products.id = ((orders.id - 1) % 12) + 1;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, confirmed, no_answer_count, confirmed_by, confirmed_by_name, updated_at
FROM orders;

INSERT INTO admin.ecotrack_order_states (
  order_id, reference, tracking_number, provider, current_status, current_amount,
  current_amount_source, delivery_tariff, return_tariff, stop_desk, payment_id,
  provider_created_at, provider_updated_at, estimated_fee, raw_status_payload,
  last_status_synced_at, last_tracking_synced_at, last_order_synced_at,
  last_action_at, created_at, updated_at
)
SELECT
  id, id::text, ecotrack_tracking_number,
  CASE WHEN ecotrack_tracking_number LIKE 'EM%' THEN 'emir' ELSE 'delivro' END,
  ecotrack_status, total_amount, 'ecotrack_orders', del_pr,
  CASE WHEN ecotrack_status = 'retour_archive' THEN 250 ELSE 0 END,
  delivery = 1,
  CASE WHEN ecotrack_status = 'payed' THEN 'DEMO-PAY-' || id ELSE NULL END,
  created_at + interval '1 day', updated_at, del_pr,
  jsonb_build_object('source', 'synthetic-demo'), updated_at, updated_at,
  updated_at, updated_at, created_at + interval '1 day', updated_at
FROM orders
WHERE ecotrack_tracking_number IS NOT NULL;

INSERT INTO analytics_journeys (
  id, first_seen_at, last_seen_at, first_path, last_path, locale, referrer,
  utm_source, utm_medium, utm_campaign, order_count, purchase_count, first_order_id
)
SELECT
  journey_id, created_at - interval '10 minutes', created_at,
  CASE WHEN id % 3 = 0 THEN '/fr/landing/atelier-sans-fil' ELSE '/fr/products' END,
  '/fr/checkout', CASE WHEN id % 4 = 0 THEN 'ar' ELSE 'fr' END,
  CASE WHEN id % 3 = 0 THEN 'https://www.facebook.com/' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'facebook' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'catalogue-demo' ELSE NULL END,
  1, CASE WHEN confirmed = 4 THEN 1 ELSE 0 END, id
FROM orders;

INSERT INTO analytics_sessions (
  id, journey_id, visit_id, started_at, last_seen_at, entry_path,
  referrer_domain, utm_source, utm_medium, utm_campaign, channel, evidence,
  has_meta_click_id, locale, viewport_class
)
SELECT
  session_id, journey_id, visit_id, created_at - interval '10 minutes', created_at,
  CASE WHEN id % 3 = 0 THEN '/fr/landing/atelier-sans-fil' ELSE '/fr/products' END,
  CASE WHEN id % 3 = 0 THEN 'facebook.com' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'facebook' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'catalogue-demo' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE 'direct' END,
  CASE WHEN id % 3 = 0 THEN 'campaign_utm' ELSE 'direct_entry' END,
  id % 3 = 0, CASE WHEN id % 4 = 0 THEN 'ar' ELSE 'fr' END,
  CASE WHEN id % 5 = 0 THEN 'desktop' ELSE 'mobile' END
FROM orders;

INSERT INTO analytics_events (
  event_id, visit_id, journey_id, session_id, event_name, ga_event_name,
  page_path, page_type, locale, product_id, product_slug, order_id, quantity,
  value, metadata, occurred_at, created_at
)
SELECT
  'demo-purchase-' || orders.id, orders.visit_id, orders.journey_id,
  orders.session_id, 'purchase', 'purchase', '/fr/thank-you',
  'order_confirmation', CASE WHEN orders.id % 4 = 0 THEN 'ar' ELSE 'fr' END,
  products.id, products.slug, orders.id, 1, orders.total_amount,
  jsonb_build_object('source', 'synthetic-demo'), orders.created_at, orders.created_at
FROM orders
JOIN products ON products.id = ((orders.id - 1) % 12) + 1;

INSERT INTO analytics_daily_rollups (
  day, dimension, dimension_key, sessions, journeys, page_views, product_views,
  add_to_carts, checkout_starts, purchases, searches, zero_result_searches
)
SELECT
  current_date - offset_day, 'all', '', 180 + offset_day % 31,
  165 + offset_day % 29, 720 + offset_day % 90, 410 + offset_day % 61,
  48 + offset_day % 11, 24 + offset_day % 7, 10 + offset_day % 5,
  37 + offset_day % 9, 3 + offset_day % 3
FROM generate_series(0, 59) offset_day;

INSERT INTO analytics_acquisition_daily_rollups (day, channel, evidence, sessions)
SELECT
  current_date - offset_day, channel,
  CASE channel
    WHEN 'paid_social' THEN 'campaign_utm'
    WHEN 'organic_search' THEN 'search_referrer'
    ELSE 'direct_entry'
  END,
  CASE channel
    WHEN 'paid_social' THEN 92 + offset_day % 11
    WHEN 'organic_search' THEN 48 + offset_day % 7
    ELSE 37 + offset_day % 5
  END
FROM generate_series(0, 59) offset_day
CROSS JOIN unnest(ARRAY['paid_social', 'organic_search', 'direct']) channel;

INSERT INTO order_acquisition_attribution (
  order_id, semantics_version, attribution_model, channel, evidence,
  session_channel, session_evidence, source_session_id, landing_path,
  utm_source, utm_medium, utm_campaign, meta_campaign_id, meta_adset_id,
  meta_ad_id, captured_at
)
SELECT
  id, 'v1', 'last_non_direct',
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE 'direct' END,
  CASE WHEN id % 3 = 0 THEN 'campaign_utm' ELSE 'direct_entry' END,
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE 'direct' END,
  CASE WHEN id % 3 = 0 THEN 'campaign_utm' ELSE 'direct_entry' END,
  session_id,
  CASE WHEN id % 3 = 0 THEN '/fr/landing/atelier-sans-fil' ELSE '/fr/products' END,
  CASE WHEN id % 3 = 0 THEN 'facebook' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'paid_social' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN 'catalogue-demo' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN '200000000001' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN '300000000001' ELSE NULL END,
  CASE WHEN id % 3 = 0 THEN '400000000001' ELSE NULL END,
  created_at
FROM orders;

INSERT INTO meta_ads_daily_insights (
  day, account_id, account_currency, account_timezone, campaign_id,
  campaign_name, adset_id, adset_name, ad_id, ad_name, objective,
  attribution_setting, action_report_time, attribution_windows, spend,
  impressions, reach, clicks, inline_link_clicks, outbound_clicks,
  unique_outbound_clicks, landing_page_views, add_to_carts,
  initiate_checkouts, purchases, purchase_value, synced_at
)
SELECT
  current_date - offset_day, '100000000001', 'EUR', 'Africa/Algiers',
  '200000000001', 'Catalogue démonstration', '300000000001',
  'Outillage mobile', '400000000001', 'Produit vedette', 'OUTCOME_SALES',
  '7d_click,1d_view', 'conversion', '["7d_click", "1d_view"]',
  18 + offset_day % 4, 4600 + offset_day * 31, 3500 + offset_day * 23,
  125 + offset_day % 20, 98 + offset_day % 16, 90 + offset_day % 14,
  78 + offset_day % 12, 82 + offset_day % 11, 16 + offset_day % 4,
  9 + offset_day % 3, 3 + offset_day % 5,
  (3 + offset_day % 5) * 14000, now()
FROM generate_series(0, 59) offset_day;

INSERT INTO meta_ads_delivery_entities (
  entity_type, entity_id, account_id, campaign_id, campaign_name, name,
  status, effective_status, objective, optimization_goal, billing_event,
  daily_budget, budget_remaining, synced_at
)
VALUES
  ('campaign', '200000000001', '100000000001', '200000000001',
   'Catalogue démonstration', 'Catalogue démonstration', 'ACTIVE', 'ACTIVE',
   'OUTCOME_SALES', NULL, NULL, 25, 180, now()),
  ('adset', '300000000001', '100000000001', '200000000001',
   'Catalogue démonstration', 'Outillage mobile', 'ACTIVE', 'ACTIVE', NULL,
   'OFFSITE_CONVERSIONS', 'IMPRESSIONS', 25, 180, now());

INSERT INTO meta_ads_sync_runs (
  trigger, status, api_version, account_id, account_currency,
  account_timezone, since_day, until_day, pages_fetched, rows_fetched,
  rows_upserted, usage, started_at, completed_at
)
VALUES (
  'demo-seed', 'succeeded', 'v25.0', '100000000001', 'EUR',
  'Africa/Algiers', current_date - 59, current_date, 4, 60, 60,
  '{"source":"synthetic-demo"}', now() - interval '2 minutes',
  now() - interval '1 minute'
);

INSERT INTO admin.profit_tracker_settings (id, fx_rate, default_return_rate)
VALUES (1, 150, 12);

INSERT INTO admin.profit_tracker_days (
  day, spend_eur, fb_purchases, cpm, ctr, link_clicks, landing_page_views,
  gross_profit_dzd, return_rate_pct, confirmed_orders, note, fx_rate_used,
  meta_synced_at
)
SELECT
  current_date - offset_day, 18 + offset_day % 4, 3 + offset_day % 5,
  4.2, 2.65, 98 + offset_day % 16, 82 + offset_day % 11,
  54000 + offset_day * 250, 12, 8 + offset_day % 5,
  'Données synthétiques', 150, now()
FROM generate_series(0, 59) offset_day;

INSERT INTO admin.profit_tracker_operating_costs (
  name, amount_dzd, period, start_date
)
VALUES
  ('Infrastructure de démonstration', 3000, 'monthly', current_date - 180),
  ('Emballage synthétique', 12000, 'monthly', current_date - 180);

INSERT INTO search_console_daily_totals (
  day, search_type, clicks, impressions, ctr, position, data_state, synced_at
)
SELECT
  current_date - offset_day, 'web', 38 + offset_day % 9,
  760 + offset_day * 4, 0.05, 6.4, 'final', now()
FROM generate_series(0, 59) offset_day;

INSERT INTO search_console_daily_rows (
  day, search_type, query, page, country, device, clicks, impressions,
  ctr, position, synced_at
)
SELECT
  current_date - offset_day, 'web',
  (ARRAY['perceuse sans fil', 'outillage algerie', 'meuleuse 125 mm'])[1 + offset_day % 3],
  'https://demo.bricomaitre.invalid/fr/products/perceuse-visseuse-20v',
  'dza', CASE WHEN offset_day % 4 = 0 THEN 'DESKTOP' ELSE 'MOBILE' END,
  12 + offset_day % 5, 240 + offset_day * 2, 0.05, 6.4, now()
FROM generate_series(0, 59) offset_day;

INSERT INTO search_console_sitemaps (
  path, site_url, type, is_pending, is_sitemaps_index, warnings, errors,
  submitted_urls, contents, last_submitted_at, last_downloaded_at, synced_at
)
VALUES (
  'https://demo.bricomaitre.invalid/sitemap.xml',
  'sc-domain:demo.bricomaitre.invalid', 'sitemap', false, false, 0, 0, 12,
  '[{"type":"web","submitted":12,"indexed":12}]',
  now() - interval '1 day', now() - interval '1 hour', now()
);

INSERT INTO search_console_sync_runs (
  trigger, status, site_url, since_day, until_day, totals_fetched,
  detail_rows_fetched, appearances_fetched, urls_inspected, started_at,
  completed_at
)
VALUES (
  'demo-seed', 'succeeded', 'sc-domain:demo.bricomaitre.invalid',
  current_date - 59, current_date, 60, 60, 0, 0,
  now() - interval '2 minutes', now() - interval '1 minute'
);

INSERT INTO admin.action_logs (
  resource, entity_type, entity_id, entity_label, operation, before_state,
  after_state, created_by, created_by_name, is_reversible, created_at, updated_at
)
SELECT
  (ARRAY['orders', 'products', 'assets', 'brands', 'categories'])[1 + ((i - 1) % 5)],
  (ARRAY['orders', 'products', 'assetBanners', 'brands', 'categories'])[1 + ((i - 1) % 5)],
  1 + (i % 12), 'Élément de démonstration ' || i,
  (ARRAY['update', 'create', 'status_change'])[1 + ((i - 1) % 3)],
  jsonb_build_object('state', 'before', 'synthetic', true),
  jsonb_build_object('state', 'after', 'synthetic', true),
  'operator@demo.bricomaitre.invalid', 'Demo Operator', i % 3 <> 2,
  now() - (i::text || ' hours')::interval,
  now() - (i::text || ' hours')::interval
FROM generate_series(1, 28) i;

INSERT INTO landing_pages (
  product_id, locale, slug, status, draft_revision, published_revision,
  created_by, updated_by, published_at
)
VALUES (
  1, 'fr', 'atelier-sans-fil', 'published', 1, 1,
  'operator@demo.bricomaitre.invalid', 'operator@demo.bricomaitre.invalid', now()
), (
  1, 'ar', 'atelier-sans-fil', 'published', 1, 1,
  'operator@demo.bricomaitre.invalid', 'operator@demo.bricomaitre.invalid', now()
);

INSERT INTO landing_page_revisions (
  landing_page_id, revision, schema_version, document, source, created_by
)
VALUES (
  1, 1, 2,
  jsonb_build_object(
    'schemaVersion', 2,
    'theme', jsonb_build_object(
      'accent', 'orange', 'density', 'comfortable', 'shell', 'campaign'
    ),
    'seo', jsonb_build_object(
      'title', 'Atelier sans fil',
      'description', 'Une page synthétique pour explorer le parcours de commande.',
      'indexable', false
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'hero', 'type', 'product-hero', 'surface', 'plain',
        'width', 'wide', 'variant', 'media-left',
        'heading', 'Équipez votre atelier sans fil',
        'subheading', 'Un parcours complet, du produit à la commande.',
        'imageUrl', :'asset_origin' || '/bricomaitre-demo/products/drill.svg',
        'imageAlt', 'Illustration synthétique d’une perceuse',
        'primaryCtaLabel', 'Commander', 'showAddToCart', true
      ),
      jsonb_build_object(
        'id', 'benefits', 'type', 'benefit-grid', 'surface', 'soft',
        'width', 'wide', 'variant', 'icons',
        'heading', 'Pensé pour le travail réel',
        'items', jsonb_build_array(
          jsonb_build_object('title', 'Autonomie', 'description', 'Une donnée de démonstration claire.', 'icon', 'power'),
          jsonb_build_object('title', 'Livraison', 'description', 'Tarifs calculés selon la destination.', 'icon', 'delivery'),
          jsonb_build_object('title', 'Commande simple', 'description', 'Confirmation téléphonique et paiement à la livraison.', 'icon', 'phone')
        )
      ),
      jsonb_build_object(
        'id', 'final', 'type', 'final-cta', 'surface', 'dark',
        'width', 'wide', 'variant', 'solid',
        'heading', 'Prêt à essayer le parcours ?',
        'body', 'Cette commande restera dans la base isolée de la démonstration.',
        'primaryCtaLabel', 'Commander', 'imageUrl', NULL, 'imageAlt', ''
      )
    )
  ),
  'demo-seed', 'operator@demo.bricomaitre.invalid'
), (
  2, 1, 2,
  jsonb_build_object(
    'schemaVersion', 2,
    'theme', jsonb_build_object(
      'accent', 'orange', 'density', 'comfortable', 'shell', 'campaign'
    ),
    'seo', jsonb_build_object(
      'title', 'ورشة لاسلكية',
      'description', 'صفحة اصطناعية لاستكشاف مسار الطلب.',
      'indexable', false
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'hero', 'type', 'product-hero', 'surface', 'plain',
        'width', 'wide', 'variant', 'media-left',
        'heading', 'جهّز ورشتك بأدوات لاسلكية',
        'subheading', 'مسار كامل من اختيار المنتج إلى إرسال الطلب.',
        'imageUrl', :'asset_origin' || '/bricomaitre-demo/products/drill.svg',
        'imageAlt', 'رسم اصطناعي لمثقاب لاسلكي',
        'primaryCtaLabel', 'اطلب الآن', 'showAddToCart', true
      ),
      jsonb_build_object(
        'id', 'benefits', 'type', 'benefit-grid', 'surface', 'soft',
        'width', 'wide', 'variant', 'icons',
        'heading', 'مصممة للعمل الحقيقي',
        'items', jsonb_build_array(
          jsonb_build_object('title', 'الاستقلالية', 'description', 'بيانات تجريبية واضحة.', 'icon', 'power'),
          jsonb_build_object('title', 'التوصيل', 'description', 'تُحسب التكلفة حسب الوجهة.', 'icon', 'delivery'),
          jsonb_build_object('title', 'طلب بسيط', 'description', 'تأكيد هاتفي ودفع عند الاستلام.', 'icon', 'phone')
        )
      ),
      jsonb_build_object(
        'id', 'final', 'type', 'final-cta', 'surface', 'dark',
        'width', 'wide', 'variant', 'solid',
        'heading', 'هل تريد تجربة المسار؟',
        'body', 'سيبقى هذا الطلب داخل قاعدة بيانات العرض المعزولة.',
        'primaryCtaLabel', 'اطلب الآن', 'imageUrl', NULL, 'imageAlt', ''
      )
    )
  ),
  'demo-seed', 'operator@demo.bricomaitre.invalid'
);

INSERT INTO admin.ecotrack_order_status_observations (
  order_id, tracking_number, status, effective_at, first_observed_at,
  last_observed_at, source, source_key
)
SELECT
  id, ecotrack_tracking_number, ecotrack_status, updated_at, updated_at,
  updated_at, 'demo-seed', 'demo-' || id
FROM orders
WHERE ecotrack_tracking_number IS NOT NULL;

INSERT INTO admin.ecotrack_order_tracking_events (
  order_id, tracking_number, event_date, event_time, status, scan_location, raw
)
SELECT
  id, ecotrack_tracking_number, updated_at::date, '10:30', ecotrack_status, city,
  jsonb_build_object('source', 'synthetic-demo')
FROM orders
WHERE ecotrack_tracking_number IS NOT NULL;

INSERT INTO demo_runtime.initialization (id, seeded_at)
VALUES (1, now())
ON CONFLICT (id) DO UPDATE SET seeded_at = excluded.seeded_at;

COMMIT;

ANALYZE;
