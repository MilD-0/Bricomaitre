CREATE TABLE demo_runtime.timeline AS
SELECT current_date - 1689 AS history_start,
  current_date - 10 AS history_end,
  1680::integer AS history_days;

CREATE TABLE demo_runtime.historical_order_seed AS
WITH generated AS (
  SELECT sequence.i,
    sequence.new_customer_count,
    sequence.new_customer_count > sequence.previous_customer_count AS is_new_customer,
    mod(sequence.i::bigint * 104729, 249000) < 199400 AS shipped,
    mod(sequence.i * 47, 100) AS status_roll,
    timeline.*
  FROM (
    SELECT i,
      ceil(i * 160000.0 / 249000)::integer AS new_customer_count,
      ceil((i - 1) * 160000.0 / 249000)::integer AS previous_customer_count
    FROM generate_series(1, 249000) i
  ) sequence
  CROSS JOIN demo_runtime.timeline timeline
), customers AS (
  SELECT generated.*,
    CASE
      WHEN is_new_customer THEN new_customer_count
      WHEN mod(i, 4) = 0 THEN greatest(
        1,
        new_customer_count - mod(i * 1543, least(new_customer_count, 2500))
      )
      ELSE 1 + mod(i * 1543, new_customer_count)
  END AS customer_id
  FROM generated
)
SELECT customers.*,
  1 + mod(customer_id * 37, 1541) AS commune_id,
  history_start::timestamptz
    + (least(
      history_days - 1,
      floor(history_days * power(i / 249000.0, 0.72))::integer
    )::text || ' days')::interval
    + (mod(i * 7919, 72000)::text || ' seconds')::interval AS ordered_at,
  CASE
    WHEN NOT shipped THEN CASE WHEN mod(i * 31, 5) = 0 THEN 1 ELSE 6 END
    WHEN status_roll < 69 THEN 4
    WHEN status_roll < 78 THEN 10
    WHEN status_roll < 95 THEN 8
    ELSE 9
  END AS in_house_status
FROM customers;

INSERT INTO orders (
  mongo_id, first_name, last_name, state, city, home_address, email,
  phone_number_1, normalized_phone, cart_products, visit_id, journey_id,
  session_id, variant, delivery, del_pr, product_subtotal, total_amount,
  price, note, confirmed, no_answer_count, confirmed_by, confirmed_by_name,
  confirmed_at, created_at, updated_at
)
SELECT
  'demo-order:' || seed.i,
  (ARRAY['Amine','Nadia','Yacine','Lina','Sofiane','Sarah','Karim','Meriem','Riad','Inès','Walid','Aya','Samir','Leïla','Nabil','Imane','Farid','Yasmine','Adel','Nesrine','Mehdi','Sabrina','Anis','Selma'])[1 + mod(seed.customer_id - 1, 24)],
  (ARRAY['Benali','Kaci','Meziane','Saadi','Boudiaf','Haddad','Cherif','Mansouri','Brahimi','Ait Ali','Bensaid','Rahmani','Bouzid','Belhadj','Mebarki','Dahmani','Ferhat','Zerrouki','Hamidi','Belkacem','Lounis','Khelifi','Amrani','Gacem'])[1 + mod((seed.customer_id - 1) / 24, 24)],
  commune.wilaya_id, commune.name,
  (10 + mod(seed.customer_id, 190)) || ' rue de démonstration, ' || commune.name,
  CASE WHEN mod(seed.customer_id, 5) = 0
    THEN 'client' || seed.customer_id || '@demo.bricomaitre.invalid' ELSE NULL END,
  '000' || lpad(seed.customer_id::text, 7, '0'),
  '000' || lpad(seed.customer_id::text, 7, '0'),
  '{}', 'history-visit-' || seed.i, 'history-journey-' || seed.i,
  'history-session-' || seed.i, 'storefront',
  CASE WHEN commune.has_stop_desk AND mod(seed.i, 4) = 0 THEN 1 ELSE 0 END,
  CASE WHEN commune.has_stop_desk AND mod(seed.i, 4) = 0
    THEN fees.stop_desk_fee ELSE fees.home_fee END,
  0, 0, 0,
  CASE WHEN mod(seed.i, 29) = 0 THEN 'Appeler après 17 h. Note synthétique.' ELSE NULL END,
  seed.in_house_status,
  CASE WHEN seed.in_house_status = 1 THEN 1 + mod(seed.i, 3) ELSE 0 END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6
    THEN (ARRAY['amine@demo.bricomaitre.invalid','sarah@demo.bricomaitre.invalid'])[1 + mod(seed.i, 2)] ELSE NULL END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6
    THEN (ARRAY['Amine Kaci','Sarah Meziane'])[1 + mod(seed.i, 2)] ELSE NULL END,
  CASE WHEN seed.in_house_status >= 2 AND seed.in_house_status <> 6
    THEN seed.ordered_at + interval '35 minutes' ELSE NULL END,
  seed.ordered_at,
  seed.ordered_at + CASE WHEN seed.in_house_status = 0 THEN interval '0' ELSE interval '35 minutes' END
FROM demo_runtime.historical_order_seed seed
JOIN admin.ecotrack_communes commune ON commune.commune_id = seed.commune_id
JOIN admin.ecotrack_service_fees fees
  ON fees.wilaya_id = commune.wilaya_id AND fees.service_type = 'livraison';

INSERT INTO order_line_items (
  order_id, product_id, content_id, raw_value, title_snapshot,
  original_unit_price, effective_unit_price, unit_purchase_price_snapshot,
  purchase_cost_source, quantity, discount_amount, line_total, thumbnail_url,
  created_at, updated_at
)
SELECT orders.id, product.id, 'line-' || orders.id || '-' || position,
  product.slug, product.title, product.price,
  product.price - CASE WHEN mod(orders.id + position, 37) = 0 THEN 250 ELSE 0 END,
  product.purchase_price, 'order_snapshot',
  1 + mod(orders.id + position, 2),
  CASE WHEN mod(orders.id + position, 37) = 0 THEN 250 ELSE 0 END,
  (product.price - CASE WHEN mod(orders.id + position, 37) = 0 THEN 250 ELSE 0 END)
    * (1 + mod(orders.id + position, 2)),
  product.images[1], orders.created_at, orders.updated_at
FROM orders
CROSS JOIN generate_series(1, 4) position
CROSS JOIN LATERAL (
  SELECT hashtextextended(orders.id::text || ':' || position, 0) & 2147483647 AS selector
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
) product;

UPDATE orders SET
  cart_products = totals.cart_products,
  product_subtotal = totals.subtotal,
  total_amount = totals.subtotal + coalesce(orders.del_pr, 0),
  price = totals.subtotal + coalesce(orders.del_pr, 0)
FROM (
  SELECT order_id, array_agg(raw_value ORDER BY id) cart_products, sum(line_total) subtotal
  FROM order_line_items GROUP BY order_id
) totals
WHERE orders.id = totals.order_id;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id, 0, 0, NULL, NULL, created_at FROM orders;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT id,
  CASE WHEN confirmed = 1 THEN 1 WHEN confirmed = 6 THEN 6 ELSE 2 END,
  CASE WHEN confirmed = 1 THEN no_answer_count ELSE 0 END,
  CASE WHEN confirmed = 0 THEN NULL ELSE coalesce(confirmed_by, 'amine@demo.bricomaitre.invalid') END,
  CASE WHEN confirmed = 0 THEN NULL ELSE coalesce(confirmed_by_name, 'Amine Kaci') END,
  created_at + interval '35 minutes'
FROM orders WHERE confirmed <> 0;

CREATE TABLE demo_runtime.shipped_orders AS
SELECT orders.id AS order_id,
  row_number() OVER (ORDER BY orders.created_at, orders.id) AS shipment_number
FROM orders
JOIN demo_runtime.historical_order_seed seed ON seed.i = orders.id
WHERE seed.shipped;

ALTER TABLE demo_runtime.shipped_orders ADD PRIMARY KEY (order_id);
CREATE UNIQUE INDEX shipped_orders_shipment_number_idx
  ON demo_runtime.shipped_orders (shipment_number);
ANALYZE demo_runtime.shipped_orders;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT orders.id, 11, 0, orders.confirmed_by, orders.confirmed_by_name,
  orders.created_at + interval '2 hours'
FROM orders
JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id;

INSERT INTO order_status_history (
  order_id, status, no_answer_count, changed_by, changed_by_name, changed_at
)
SELECT orders.id, orders.confirmed, 0, orders.confirmed_by, orders.confirmed_by_name,
  orders.created_at + CASE orders.confirmed
    WHEN 9 THEN interval '3 days'
    ELSE interval '4 days'
  END
FROM orders
JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id;

UPDATE orders SET
  ecotrack_status = CASE confirmed
    WHEN 3 THEN 'en_preparation' WHEN 4 THEN 'payed' WHEN 5 THEN 'suspendu'
    WHEN 7 THEN 'en_livraison' WHEN 8 THEN 'retour_archive'
    WHEN 9 THEN 'annule' WHEN 10 THEN 'livre_non_encaisse' ELSE 'prete_a_expedier' END,
  ecotrack_status_last_update = created_at + interval '4 days',
  ecotrack_status_data = jsonb_build_object('source', 'deterministic-demo', 'status', confirmed),
  ecotrack_reference = 'DEMO-' || shipped.shipment_number,
  ecotrack_tracking_number = CASE WHEN mod(shipped.shipment_number, 4) = 0 THEN 'EMD' ELSE 'DLD' END
    || lpad(shipped.shipment_number::text, 9, '0'),
  updated_at = created_at + interval '4 days'
FROM demo_runtime.shipped_orders shipped WHERE orders.id = shipped.order_id;

INSERT INTO admin.ecotrack_order_states (
  order_id, reference, tracking_number, provider, current_status, current_amount,
  current_amount_source, delivery_tariff, return_tariff, stop_desk, payment_id,
  status_reason, provider_created_at, provider_updated_at, estimated_fee,
  desk_commune, raw_status_payload, raw_create_payload, raw_order_payload,
  last_status_synced_at, last_tracking_synced_at, last_maj_synced_at,
  last_order_synced_at, last_action_at, deleted_at, created_at, updated_at
)
SELECT orders.id, orders.ecotrack_reference, orders.ecotrack_tracking_number,
  CASE WHEN orders.ecotrack_tracking_number LIKE 'EMD%' THEN 'emir' ELSE 'delivro' END,
  orders.ecotrack_status, orders.total_amount, 'ecotrack_orders', orders.del_pr,
  CASE WHEN orders.confirmed = 8 THEN round(orders.del_pr * 0.45, 2) ELSE 0 END,
  orders.delivery = 1,
  CASE WHEN orders.confirmed = 4 THEN 'PAY-' || orders.ecotrack_reference ELSE NULL END,
  CASE WHEN orders.confirmed = 5 THEN 'Customer requested another delivery day'
       WHEN orders.confirmed = 9 THEN 'Address could not be reached' ELSE NULL END,
  orders.created_at + interval '1 day', orders.created_at + interval '4 days',
  orders.del_pr, CASE WHEN orders.delivery = 1 THEN orders.city ELSE NULL END,
  jsonb_build_object('status', orders.ecotrack_status, 'synthetic', true),
  jsonb_build_object('reference', orders.ecotrack_reference, 'synthetic', true),
  jsonb_build_object('amount', orders.total_amount, 'synthetic', true),
  now(), now(), now(), now(),
  orders.created_at + interval '4 days',
  NULL,
  orders.created_at + interval '1 day',
  now()
FROM orders JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id;

INSERT INTO admin.ecotrack_order_status_observations (
  order_id, tracking_number, status, effective_at, first_observed_at,
  last_observed_at, source, source_key
)
SELECT orders.id, orders.ecotrack_tracking_number,
  CASE observation WHEN 1 THEN 'en_preparation' ELSE orders.ecotrack_status END,
  orders.created_at + (observation * interval '2 days'),
  orders.created_at + (observation * interval '2 days'),
  orders.created_at + (observation * interval '2 days'),
  'orders_status', 'status-' || observation
FROM orders JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id
CROSS JOIN generate_series(1, 2) observation;

INSERT INTO admin.ecotrack_order_tracking_events (
  order_id, tracking_number, event_date, event_time, status, scan_location, raw
)
SELECT orders.id, orders.ecotrack_tracking_number,
  (orders.created_at + (event_number * interval '1 day'))::date,
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
  CASE event_number WHEN 1 THEN 'Hub central' WHEN 2 THEN 'Centre de tri'
    ELSE orders.city END,
  jsonb_build_object('synthetic', true, 'sequence', event_number)
FROM orders JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id
CROSS JOIN generate_series(1, 4) event_number;

INSERT INTO admin.ecotrack_order_activities (
  order_id, tracking_number, reason, details, effective_at, postponed_to,
  first_observed_at, last_observed_at, source_key
)
SELECT orders.id, orders.ecotrack_tracking_number,
  CASE WHEN orders.confirmed = 5 THEN 'reporté' ELSE 'appel_livreur' END,
  CASE WHEN orders.confirmed = 5 THEN 'Nouvelle date convenue avec le client.'
    ELSE 'Coordination synthétique de livraison.' END,
  orders.created_at + interval '3 days',
  CASE WHEN orders.confirmed = 5 THEN (orders.created_at + interval '5 days')::date ELSE NULL END,
  orders.created_at + interval '3 days', orders.created_at + interval '3 days',
  'activity-' || orders.id
FROM orders JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id
WHERE mod(shipped.shipment_number, 10) = 0;

INSERT INTO admin.ecotrack_order_maj_entries (
  order_id, tracking_number, remarque, station, livreur, remote_created_at, raw
)
SELECT orders.id, orders.ecotrack_tracking_number,
  CASE WHEN orders.confirmed = 8 THEN 'Retour vers l’expéditeur' ELSE 'Mise à jour de tournée' END,
  orders.city, 'Livreur démo ' || mod(shipped.shipment_number, 40),
  orders.created_at + interval '3 days', '{"synthetic":true}'
FROM orders JOIN demo_runtime.shipped_orders shipped ON shipped.order_id = orders.id
WHERE mod(shipped.shipment_number, 7) = 0;

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
  costs.product_cost,
  orders.total_amount - orders.del_pr - 35 - costs.product_cost,
  orders.del_pr, 0, 0, 10, 0, 25,
  orders.created_at + interval '3 days', orders.created_at,
  orders.created_at + interval '4 days',
  'history-' || to_char(orders.created_at, 'YYYY-MM'), orders.created_at + interval '5 days'
FROM orders
JOIN admin.ecotrack_wilayas wilaya ON wilaya.wilaya_id = orders.state
JOIN LATERAL (
  SELECT sum(coalesce(unit_purchase_price_snapshot, 0) * quantity) product_cost
  FROM order_line_items WHERE order_id = orders.id
) costs ON true
WHERE orders.confirmed = 4 AND orders.ecotrack_tracking_number IS NOT NULL;

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
LEFT JOIN brands brand ON brand.id = product.brand_id;

INSERT INTO demo_runtime.dataset_metrics VALUES
  ('historical_orders', 249000, 'Orders spanning the 1,680-day historical window'),
  ('historical_line_items', (SELECT count(*) FROM order_line_items), 'Four line items per historical order'),
  ('historical_shipments', (SELECT count(*) FROM demo_runtime.shipped_orders), 'Carrier-linked historical orders');
