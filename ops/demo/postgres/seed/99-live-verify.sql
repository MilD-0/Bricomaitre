DO $$
DECLARE
  order_count bigint;
  line_count bigint;
  shipment_count bigint;
BEGIN
  SELECT count(*) INTO order_count FROM orders;
  SELECT count(*) INTO line_count FROM order_line_items;
  SELECT count(*) INTO shipment_count FROM admin.ecotrack_order_states;

  IF order_count <> 250800 OR line_count <> 1003200 OR shipment_count <> 200888 THEN
    RAISE EXCEPTION 'Live commerce invariant failed: orders=%, lines=%, shipments=%',
      order_count, line_count, shipment_count;
  END IF;

  IF (SELECT count(DISTINCT order_id) FROM order_status_history WHERE status = 11) <> 200888
    OR (SELECT count(*) FROM admin.ecotrack_order_states WHERE deleted_at IS NULL) <> 200888 THEN
    RAISE EXCEPTION 'Shipment lifecycle coverage is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM admin.ecotrack_order_states
    WHERE deleted_at IS NULL AND current_status NOT IN (
      'prete_a_expedier', 'en_preparation', 'en_livraison', 'suspendu',
      'livre_non_encaisse', 'payed', 'retour_archive', 'annule'
    )
  ) THEN
    RAISE EXCEPTION 'Live carrier records contain unsupported status values';
  END IF;

  IF (SELECT count(*) FROM analytics_sessions WHERE id LIKE 'demo-live-session-%') <> 68400
    OR (SELECT count(*) FROM analytics_events WHERE event_id LIKE 'demo-live-event-%') <> 410400 THEN
    RAISE EXCEPTION 'Raw seven-day analytics coverage is incomplete';
  END IF;

  IF (SELECT count(*) FROM orders
      WHERE mongo_id LIKE 'demo-live-order:%' AND session_id LIKE 'demo-live-session-%') <> 1260
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE mongo_id LIKE 'demo-live-order:%'
        AND session_id LIKE 'demo-live-session-%'
        AND created_at < now() - interval '7 days 15 minutes'
    ) THEN
    RAISE EXCEPTION 'Raw storefront sessions do not match the seven-day order cohort';
  END IF;

  IF (SELECT count(*) FROM analytics_events WHERE event_id LIKE 'demo-live-ai-run-%') <> 180
    OR EXISTS (
      SELECT 1 FROM analytics_events
      WHERE event_id LIKE 'demo-live-ai-run-%'
        AND NOT (metadata->>'durationMs' ~ '^[0-9]+$')
    ) THEN
    RAISE EXCEPTION 'Shopping-assistant latency samples are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(current_date - 1689, current_date, interval '1 day') expected(day)
    LEFT JOIN (
      SELECT day FROM analytics_daily_rollups WHERE dimension = 'overall'
      UNION
      SELECT (occurred_at at time zone 'Africa/Algiers')::date
      FROM analytics_events WHERE event_id LIKE 'demo-live-event-%'
    ) observed ON observed.day = expected.day::date
    WHERE observed.day IS NULL
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Storefront analytics timeline has a gap';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_events
    WHERE event_id LIKE 'demo-live-event-%'
      AND (occurred_at < now() - interval '7 days 15 minutes' OR occurred_at > now())
  ) THEN
    RAISE EXCEPTION 'Raw analytics extends beyond the intended current window';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_events
    WHERE event_id LIKE 'demo-live-event-%'
      AND (
        (page_path ~ '^/(fr|ar)/checkout$' AND event_name <> 'begin_checkout')
        OR (page_path ~ '^/(fr|ar)/thank-you$' AND event_name <> 'purchase')
      )
  ) THEN
    RAISE EXCEPTION 'Raw analytics paths disagree with their events';
  END IF;

  IF EXISTS (
    SELECT 1 FROM analytics_sessions
    WHERE id LIKE 'demo-live-session-%' AND channel NOT IN (
      'meta_paid', 'google_organic', 'direct_dark_social',
      'other_referral', 'google_paid'
    )
  ) OR EXISTS (
    SELECT 1
    FROM order_acquisition_attribution attribution
    JOIN orders ON orders.id = attribution.order_id
    JOIN analytics_sessions session ON session.id = attribution.source_session_id
    WHERE orders.mongo_id LIKE 'demo-live-order:%'
      AND (attribution.channel <> session.channel
        OR attribution.evidence <> session.evidence
        OR attribution.session_channel <> session.channel
        OR attribution.session_evidence <> session.evidence)
  ) THEN
    RAISE EXCEPTION 'Current acquisition records disagree at the session boundary';
  END IF;

  IF (SELECT count(DISTINCT (metadata->>'landingPageId')::bigint)
      FROM analytics_events
      WHERE event_id LIKE 'demo-live-event-%'
        AND metadata->>'landingPageId' ~ '^[0-9]+$') <> 8
    OR (SELECT count(*) FROM analytics_events
      WHERE event_id LIKE 'demo-live-event-%' AND event_name = 'purchase'
        AND metadata->>'landingPageId' ~ '^[0-9]+$') NOT BETWEEN 180 AND 300 THEN
    RAISE EXCEPTION 'Landing-page activity is not distributed across the published set';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM landing_pages page
    LEFT JOIN analytics_events event
      ON event.metadata->>'landingPageId' = page.id::text
      AND event.event_id LIKE 'demo-live-event-%'
    WHERE page.status = 'published'
    GROUP BY page.id
    HAVING count(*) FILTER (WHERE event.event_name = 'add_to_cart') = 0
      OR count(*) FILTER (WHERE event.event_name = 'begin_checkout') = 0
      OR count(*) FILTER (WHERE event.event_name = 'purchase') = 0
  ) OR EXISTS (
    SELECT 1
    FROM analytics_events purchase
    WHERE purchase.event_id LIKE 'demo-live-event-%'
      AND purchase.event_name = 'purchase'
      AND (NOT EXISTS (
        SELECT 1 FROM analytics_events cart
        WHERE cart.session_id = purchase.session_id AND cart.event_name = 'add_to_cart'
      ) OR NOT EXISTS (
        SELECT 1 FROM analytics_events checkout
        WHERE checkout.session_id = purchase.session_id
          AND checkout.event_name = 'begin_checkout'
      ))
  ) THEN
    RAISE EXCEPTION 'Current storefront journeys violate the checkout funnel';
  END IF;

  IF (SELECT count(DISTINCT metadata->>'metricName') FROM analytics_events
      WHERE event_id LIKE 'demo-live-event-%' AND event_name = 'web_vital') <> 3
    OR EXISTS (
      SELECT 1 FROM analytics_events
      WHERE event_id LIKE 'demo-live-event-%' AND event_name = 'web_vital'
        AND (metadata->>'metricName' NOT IN ('LCP', 'INP', 'CLS')
          OR metadata->>'metricValue' !~ '^[0-9]+(\.[0-9]+)?$'
          OR metadata->>'metricRating' NOT IN ('good', 'needs-improvement', 'poor'))
    ) THEN
    RAISE EXCEPTION 'Web Vitals metadata is incomplete';
  END IF;

  IF (SELECT count(*) FROM (
      SELECT metadata->>'metricName', metadata->>'metricRating'
      FROM analytics_events
      WHERE event_id LIKE 'demo-live-event-%' AND event_name = 'web_vital'
      GROUP BY 1, 2 HAVING count(*) >= 500
    ) distributions) <> 9 THEN
    RAISE EXCEPTION 'Web Vitals ratings are mechanically concentrated';
  END IF;

  IF (SELECT max(searches) FROM analytics_daily_rollups
      WHERE dimension = 'search' AND day >= current_date - 9)
      < 4 * (SELECT min(searches) FROM analytics_daily_rollups
        WHERE dimension = 'search' AND day >= current_date - 9) THEN
    RAISE EXCEPTION 'Current search demand lacks a plausible long tail';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM order_status_history history
    JOIN orders ON orders.id = history.order_id
    WHERE orders.mongo_id LIKE 'demo-live-order:%'
      AND history.status = 11 AND history.changed_at::date = current_date
  ) THEN
    RAISE EXCEPTION 'The open order pipeline has no same-day postings';
  END IF;

  IF (SELECT count(DISTINCT product_id) FROM order_line_items
      WHERE content_id LIKE 'live-line-%') < 1500
    OR EXISTS (
      SELECT 1
      FROM search_console_daily_totals total
      LEFT JOIN (
        SELECT day, sum(clicks) clicks, sum(impressions) impressions
        FROM search_console_daily_rows GROUP BY day
      ) rows USING (day)
      WHERE total.clicks <> coalesce(rows.clicks, 0)
        OR total.impressions <> coalesce(rows.impressions, 0)
    ) THEN
    RAISE EXCEPTION 'Current product or search demand is mechanically concentrated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM meta_ads_daily_insights
    WHERE purchases > 0
      AND purchase_value / purchases NOT BETWEEN 300 AND 650
  ) THEN
    RAISE EXCEPTION 'Meta purchase values are not expressed in account currency';
  END IF;

  IF EXISTS (
    SELECT 1 FROM orders
    WHERE mongo_id LIKE 'demo-live-order:%'
      AND (confirmed_at > now() OR updated_at > now())
  ) OR EXISTS (
    SELECT 1 FROM order_status_history history
    JOIN orders ON orders.id = history.order_id
    WHERE orders.mongo_id LIKE 'demo-live-order:%' AND history.changed_at > now()
  ) THEN
    RAISE EXCEPTION 'Live order timelines are incoherent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_conversations WHERE session_key = 'demo-showcase-current')
    OR NOT EXISTS (SELECT 1 FROM meta_worker_heartbeat WHERE worker_key = 'storefront-meta-worker') THEN
    RAISE EXCEPTION 'Reset-relative operational state is incomplete';
  END IF;
END $$;

DO $$
DECLARE
  busiest_complete_day integer;
  median_complete_day numeric;
BEGIN
  WITH daily AS (
    SELECT (changed_at AT TIME ZONE 'Africa/Algiers')::date AS day,
      count(DISTINCT order_id)::integer AS orders
    FROM order_status_history
    WHERE status = 11
      AND (changed_at AT TIME ZONE 'Africa/Algiers')::date <= current_date - 4
    GROUP BY 1
  )
  SELECT max(orders), percentile_cont(0.5) WITHIN GROUP (ORDER BY orders)
  INTO busiest_complete_day, median_complete_day
  FROM daily;

  IF busiest_complete_day > median_complete_day * 1.5 THEN
    RAISE EXCEPTION 'Historical/live posting seam creates an artificial volume spike';
  END IF;
END $$;

COMMIT;
