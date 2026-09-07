#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER must be set}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD must be set}"
: "${POSTGRES_STOREFRONT_USER:?POSTGRES_STOREFRONT_USER must be set}"
: "${POSTGRES_STOREFRONT_PASSWORD:?POSTGRES_STOREFRONT_PASSWORD must be set}"

PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}" psql \
  --set=ON_ERROR_STOP=1 \
  --host "${POSTGRES_HOST:-127.0.0.1}" \
  --port "${POSTGRES_PORT:-5432}" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=admin_user="$POSTGRES_ADMIN_USER" \
  --set=admin_password="$POSTGRES_ADMIN_PASSWORD" \
  --set=storefront_user="$POSTGRES_STOREFRONT_USER" \
  --set=storefront_password="$POSTGRES_STOREFRONT_PASSWORD" \
  --set=owner_user="$POSTGRES_USER" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'admin_user', :'admin_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'admin_user')
\gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'storefront_user', :'storefront_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'storefront_user')
\gexec

ALTER ROLE :"admin_user" LOGIN PASSWORD :'admin_password';
ALTER ROLE :"storefront_user" LOGIN PASSWORD :'storefront_password';
GRANT :"owner_user" TO :"admin_user";

GRANT CONNECT ON DATABASE :"database_name" TO :"admin_user", :"storefront_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"admin_user";
REVOKE CREATE ON SCHEMA public FROM :"storefront_user";
GRANT USAGE ON SCHEMA public TO :"storefront_user";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"storefront_user";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"storefront_user";

-- Keep the public process away from Admin authentication, authorization, and
-- operational tables. The allowlist is reconciled before and after migrations
-- on every deploy, while missing tables are harmless during a fresh bootstrap.
WITH read_only_table(table_name) AS (
  SELECT unnest(ARRAY[
    'public.asset_banners',
    'public.brands',
    'public.categories',
    'public.featured_product_group_brands',
    'public.featured_product_group_categories',
    'public.featured_product_group_products',
    'public.featured_product_groups',
    'public.landing_page_revisions',
    'public.landing_pages',
    'public.product_cards',
    'public.product_promo_codes',
    'public.product_slug_history',
    'public.products',
    'public.storefront_announcements',
    'public.storefront_settings'
  ]::text[])
)
SELECT format(
  'GRANT SELECT ON TABLE %s TO %I',
  to_regclass(table_name),
  :'storefront_user'
)
FROM read_only_table
WHERE to_regclass(table_name) IS NOT NULL
\gexec

WITH read_write_table(table_name) AS (
  SELECT unnest(ARRAY[
    'public.analytics_acquisition_daily_rollups',
    'public.analytics_ai_daily_rollups',
    'public.analytics_daily_rollups',
    'public.analytics_distinct_daily_members',
    'public.analytics_events',
    'public.analytics_journeys',
    'public.analytics_paid_click_daily_rollups',
    'public.analytics_paid_click_visits',
    'public.analytics_sessions',
    'public.marketing_event_outbox',
    'public.meta_event_daily_rollups',
    'public.meta_event_outbox',
    'public.meta_worker_heartbeat',
    'public.order_acquisition_attribution',
    'public.order_ai_influence',
    'public.order_line_items',
    'public.order_marketing_attribution',
    'public.order_meta_attribution',
    'public.order_status_history',
    'public.orders',
    'public.storefront_order_idempotency'
  ]::text[])
)
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO %I',
  to_regclass(table_name),
  :'storefront_user'
)
FROM read_write_table
WHERE to_regclass(table_name) IS NOT NULL
\gexec

WITH read_write_table(table_name) AS (
  SELECT unnest(ARRAY[
    'public.analytics_acquisition_daily_rollups',
    'public.analytics_ai_daily_rollups',
    'public.analytics_daily_rollups',
    'public.analytics_distinct_daily_members',
    'public.analytics_events',
    'public.analytics_journeys',
    'public.analytics_paid_click_daily_rollups',
    'public.analytics_paid_click_visits',
    'public.analytics_sessions',
    'public.marketing_event_outbox',
    'public.meta_event_daily_rollups',
    'public.meta_event_outbox',
    'public.meta_worker_heartbeat',
    'public.order_acquisition_attribution',
    'public.order_ai_influence',
    'public.order_line_items',
    'public.order_marketing_attribution',
    'public.order_meta_attribution',
    'public.order_status_history',
    'public.orders',
    'public.storefront_order_idempotency'
  ]::text[])
), allowed_oid(table_oid) AS (
  SELECT to_regclass(table_name) FROM read_write_table WHERE to_regclass(table_name) IS NOT NULL
), owned_sequence(sequence_oid) AS (
  SELECT DISTINCT sequence.oid
  FROM allowed_oid
  JOIN pg_depend dependency ON dependency.refobjid = allowed_oid.table_oid
  JOIN pg_class sequence ON sequence.oid = dependency.objid AND sequence.relkind = 'S'
)
SELECT format('GRANT USAGE, SELECT ON SEQUENCE %s TO %I', sequence_oid::regclass, :'storefront_user')
FROM owned_sequence
\gexec

SELECT format('GRANT USAGE ON SCHEMA admin TO %I', :'storefront_user')
WHERE EXISTS (SELECT FROM pg_namespace WHERE nspname = 'admin')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA admin FROM %I', :'storefront_user')
WHERE EXISTS (SELECT FROM pg_namespace WHERE nspname = 'admin')
\gexec
WITH allowed_table(table_name) AS (
  SELECT unnest(ARRAY[
    'admin.ecotrack_communes',
    'admin.ecotrack_service_fees',
    'admin.ecotrack_sync_runs',
    'admin.ecotrack_weight_fees',
    'admin.ecotrack_wilayas'
  ]::text[])
)
SELECT format('GRANT SELECT ON TABLE %s TO %I', to_regclass(table_name), :'storefront_user')
FROM allowed_table
WHERE to_regclass(table_name) IS NOT NULL
\gexec
SQL
