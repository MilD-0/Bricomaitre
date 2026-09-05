DO $$
DECLARE
  product_count bigint;
  catalog_image_count bigint;
  historical_orders bigint;
  historical_lines bigint;
  historical_shipments bigint;
  unsafe_records bigint;
BEGIN
  SELECT count(*), sum(cardinality(images)) INTO product_count, catalog_image_count FROM products;
  IF product_count <> 3884 OR catalog_image_count <> 9065 THEN
    RAISE EXCEPTION 'Catalog invariant failed: products=%, images=%', product_count, catalog_image_count;
  END IF;

  IF (SELECT count(*) FROM product_cards WHERE active) <> 4
    OR (SELECT count(*) FROM asset_banners WHERE active) <> 2
    OR (SELECT count(*) FROM brands WHERE featured) <> 8
    OR (SELECT count(*) FROM featured_product_groups WHERE active) <> 3
    OR EXISTS (
      SELECT group_id FROM featured_product_group_products
      GROUP BY group_id HAVING count(*) <> 4
    ) THEN
    RAISE EXCEPTION 'Homepage merchandising is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM featured_product_groups
    WHERE active AND show_at_top_of_products_page
  ) THEN
    RAISE EXCEPTION 'Featured groups must not override the independent top-product row';
  END IF;

  IF (SELECT count(*) FROM demo_runtime.merchandise_products WHERE placement = 'top') <> 4
    OR (SELECT count(*) FROM landing_pages WHERE status = 'published') <> 8
    OR (SELECT count(*) FROM landing_pages WHERE status = 'draft') <> 4 THEN
    RAISE EXCEPTION 'Curated storefront surfaces have the wrong shape';
  END IF;

  IF (SELECT count(*) FROM demo_runtime.landing_page_products) <> 6
    OR EXISTS (
      SELECT 1
      FROM demo_runtime.landing_page_products campaign
      LEFT JOIN products product ON product.mongo_id = campaign.product_key
      WHERE product.id IS NULL OR NOT product.active OR cardinality(product.images) < 4
    )
    OR EXISTS (
      SELECT 1
      FROM landing_pages page
      JOIN products product ON product.id = page.product_id
      LEFT JOIN demo_runtime.landing_page_products campaign
        ON campaign.product_key = product.mongo_id
      WHERE campaign.product_key IS NULL
    ) THEN
    RAISE EXCEPTION 'Landing-page campaigns are incomplete or mechanically selected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE session_key LIKE 'historical-conversation-%' OR session_key = 'demo-showcase-current'
  ) THEN
    RAISE EXCEPTION 'Demo chat history must start empty';
  END IF;

  IF EXISTS (
    SELECT 1 FROM landing_pages page
    LEFT JOIN landing_page_revisions revision ON revision.landing_page_id = page.id
      AND revision.revision = page.draft_revision
    WHERE revision.id IS NULL OR jsonb_array_length(revision.document->'blocks') < 8
      OR NOT revision.document->'blocks' @> '[{"type":"specifications"},{"type":"faq"}]'::jsonb
  ) THEN
    RAISE EXCEPTION 'Demo campaigns need product details and purchasing answers';
  END IF;

  IF EXISTS (
    SELECT 1 FROM product_cards card
    JOIN demo_runtime.merchandise_product_ids merchandise
      ON merchandise.product_id = card.product_id
    WHERE card.active
  ) THEN
    RAISE EXCEPTION 'Homepage editorial cards and product rows must not repeat products';
  END IF;

  IF ARRAY(
    SELECT mongo_id FROM (
      SELECT mongo_id FROM products
      WHERE active AND archived_at IS NULL
      ORDER BY in_stock DESC, units_sold DESC, updated_at DESC, id DESC
      LIMIT 4
    ) ranked ORDER BY mongo_id
  ) <> ARRAY(
    SELECT product_key FROM demo_runtime.merchandise_products
    WHERE placement = 'top' ORDER BY product_key
  ) THEN
    RAISE EXCEPTION 'Homepage top products do not match the curated selection';
  END IF;

  IF EXISTS (
    SELECT 1 FROM brands
    WHERE image IS NOT NULL AND image NOT LIKE '%/bricomaitre-demo/merchandising/brands/%'
  ) OR EXISTS (
    SELECT 1 FROM asset_banners
    WHERE image_url NOT LIKE '%/bricomaitre-demo/merchandising/banners/%'
      OR image_url_portrait NOT LIKE '%/bricomaitre-demo/merchandising/banners/%'
      OR image_url_landscape NOT LIKE '%/bricomaitre-demo/merchandising/banners/%'
  ) THEN
    RAISE EXCEPTION 'Homepage artwork must come from the local merchandising library';
  END IF;

  SELECT count(*) INTO historical_orders FROM orders;
  SELECT count(*) INTO historical_lines FROM order_line_items;
  SELECT count(*) INTO historical_shipments FROM admin.ecotrack_order_states;
  IF historical_orders <> 249000 OR historical_lines <> 996000 OR historical_shipments <> 199400 THEN
    RAISE EXCEPTION 'Commerce invariant failed: orders=%, lines=%, shipments=%',
      historical_orders, historical_lines, historical_shipments;
  END IF;

  IF EXISTS (SELECT 1 FROM admin.ecotrack_order_states WHERE deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Historical carrier outcomes must remain available to analytics';
  END IF;

  IF (SELECT count(DISTINCT order_id) FROM order_status_history WHERE status = 11) <> 199400 THEN
    RAISE EXCEPTION 'Every historical shipment must retain its posted transition';
  END IF;

  IF EXISTS (
    SELECT 1 FROM admin.ecotrack_order_states
    WHERE current_status NOT IN (
      'prete_a_expedier', 'en_preparation', 'en_livraison', 'suspendu',
      'livre_non_encaisse', 'payed', 'retour_archive', 'annule'
    )
  ) THEN
    RAISE EXCEPTION 'Historical carrier records contain unsupported status values';
  END IF;

  IF (SELECT count(*) FROM admin.ecotrack_wilayas) <> 58
    OR (SELECT count(*) FROM admin.ecotrack_communes) <> 1541 THEN
    RAISE EXCEPTION 'Algeria reference coverage is incomplete';
  END IF;

  IF (SELECT value FROM demo_runtime.dataset_metrics WHERE metric = 'generated_historical_sessions') <> 12000000
    OR (SELECT value FROM demo_runtime.dataset_metrics WHERE metric = 'generated_historical_events') <> 72000000 THEN
    RAISE EXCEPTION 'Historical analytics generation totals are incorrect';
  END IF;

  IF (SELECT count(*) FROM analytics_daily_rollups WHERE dimension = 'overall') <> 1680
    OR (SELECT count(DISTINCT normalized_phone) FROM orders) <> 160000 THEN
    RAISE EXCEPTION 'Historical timeline or customer population is incomplete';
  END IF;

  IF (SELECT rest_from FROM admin.profit_tracker_settings WHERE id = 1) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM analytics_acquisition_daily_rollups
      WHERE channel NOT IN (
        'meta_paid', 'google_organic', 'direct_dark_social',
        'other_referral', 'google_paid'
      )
    ) OR EXISTS (
      SELECT 1 FROM order_acquisition_attribution
      WHERE channel NOT IN (
        'meta_paid', 'google_organic', 'direct_dark_social',
        'other_referral', 'google_paid'
      ) OR session_channel <> channel OR session_evidence <> evidence
    ) THEN
    RAISE EXCEPTION 'Accounting or acquisition configuration uses conflicting semantics';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM search_console_daily_totals total
    LEFT JOIN (
      SELECT day, sum(clicks) clicks, sum(impressions) impressions
      FROM search_console_daily_rows GROUP BY day
    ) rows USING (day)
    WHERE total.clicks <> coalesce(rows.clicks, 0)
      OR total.impressions <> coalesce(rows.impressions, 0)
  ) THEN
    RAISE EXCEPTION 'Search Console detail does not reconcile with daily totals';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_daily_rollups
    WHERE dimension = 'overall' AND NOT (
      page_views >= product_views
      AND product_views >= add_to_carts
      AND add_to_carts >= checkout_starts
      AND checkout_starts >= purchases
    )
  ) OR EXISTS (
    SELECT 1 FROM analytics_daily_rollups
    WHERE dimension = 'product' AND purchases > product_views
  ) THEN
    RAISE EXCEPTION 'Storefront analytics violate the browsing or purchase funnel';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_ai_daily_rollups
    WHERE dimension = 'intent' AND result_clicks > messages
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT day, sum(result_clicks) clicks
      FROM analytics_ai_daily_rollups WHERE dimension = 'overall' GROUP BY day
    ) overall
    JOIN (
      SELECT day, sum(result_clicks) clicks
      FROM analytics_ai_daily_rollups WHERE dimension = 'intent' GROUP BY day
    ) intents USING (day)
    WHERE abs(overall.clicks - intents.clicks) > 5
  ) THEN
    RAISE EXCEPTION 'Shopping-assistant intent rollups do not reconcile with overall demand';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_ai_daily_rollups
    WHERE dimension = 'overall' AND runs <> completed + failed + cancelled
  ) OR (
    SELECT count(DISTINCT level) FROM order_ai_influence
  ) <> 4 THEN
    RAISE EXCEPTION 'Shopping-assistant outcomes are incomplete';
  END IF;

  IF (SELECT count(*) FROM ai_runs WHERE status = 'failed') = 0
    OR (SELECT count(*) FROM ai_runs WHERE status = 'cancelled') = 0 THEN
    RAISE EXCEPTION 'AI operations lack realistic terminal outcomes';
  END IF;

  IF (SELECT count(*) FROM ai_runs) < 1700
    OR (SELECT count(*) FROM landing_pages) < 10
    OR (SELECT count(*) FROM admin.action_logs) < 1000
    OR (SELECT count(*) FROM admin.bulletin_posts) < 10 THEN
    RAISE EXCEPTION 'An operational surface is under-populated';
  END IF;

  SELECT count(*) INTO unsafe_records FROM orders
  WHERE phone_number_1 !~ '^000[0-9]{7}$'
    OR (email IS NOT NULL AND email NOT LIKE '%@demo.bricomaitre.invalid');
  IF unsafe_records <> 0 THEN
    RAISE EXCEPTION 'Customer records contain non-demo contact data';
  END IF;

  IF EXISTS (
    SELECT 1 FROM products, unnest(images) image
    WHERE image NOT LIKE '%/bricomaitre-demo/catalog/%'
  ) THEN
    RAISE EXCEPTION 'Catalog contains a non-local runtime image URL';
  END IF;

  IF (SELECT contact_phone FROM storefront_settings WHERE id = 1) <> '0550000000' THEN
    RAISE EXCEPTION 'Storefront settings contain an invalid demo contact number';
  END IF;
END $$;

DO $$
DECLARE
  minimum_conversion numeric;
  maximum_conversion numeric;
BEGIN
  WITH orders_by_channel AS (
    SELECT channel, count(*) orders
    FROM order_acquisition_attribution
    GROUP BY channel
  ), sessions_by_channel AS (
    SELECT channel, sum(sessions) sessions
    FROM analytics_acquisition_daily_rollups
    GROUP BY channel
  ), channel_performance AS (
    SELECT orders.channel,
      orders.orders::numeric / nullif(sessions.sessions, 0) * 100 AS conversion_rate
    FROM orders_by_channel orders
    JOIN sessions_by_channel sessions USING (channel)
  )
  SELECT min(conversion_rate), max(conversion_rate)
  INTO minimum_conversion, maximum_conversion
  FROM channel_performance;

  IF minimum_conversion IS NULL OR maximum_conversion - minimum_conversion < 0.25 THEN
    RAISE EXCEPTION 'Acquisition channels are implausibly uniform';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM admin.profit_tracker_days
    WHERE gross_profit_dzd IS NOT NULL
       OR return_rate_pct IS NOT NULL
       OR confirmed_orders IS NOT NULL
       OR note IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Provider observations must not masquerade as manual profit overrides';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM demo_runtime.merchandise_product_ids merchandise
    JOIN products product ON product.id = merchandise.product_id
    JOIN brands brand ON brand.id = product.brand_id
    WHERE merchandise.placement <> 'top' AND lower(brand.name) LIKE 'amazon%'
  ) THEN
    RAISE EXCEPTION 'Featured groups still contain generic Amazon house-brand products';
  END IF;

  IF (SELECT count(*) FROM featured_product_groups WHERE active) <> 3
    OR EXISTS (
      SELECT 1 FROM featured_product_groups groups
      LEFT JOIN featured_product_group_products products ON products.group_id = groups.id
      WHERE groups.active
      GROUP BY groups.id
      HAVING count(products.product_id) <> 4
    ) THEN
    RAISE EXCEPTION 'Featured storefront groups are incomplete';
  END IF;
END $$;

INSERT INTO demo_runtime.template_metadata (id, build_key, built_at)
VALUES (1, :'build_key', now());
