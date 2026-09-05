SET synchronous_commit = off;
SET client_min_messages = warning;

DROP SCHEMA IF EXISTS demo_runtime CASCADE;
CREATE SCHEMA demo_runtime;

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

CREATE TABLE demo_runtime.catalog_source (
  source_dataset text NOT NULL,
  source_product_id text NOT NULL,
  family_key text NOT NULL,
  subtype_key text NOT NULL,
  source_title text NOT NULL,
  source_description text NOT NULL,
  source_bullet_points text NOT NULL,
  source_brand text NOT NULL,
  source_color text NOT NULL,
  source_image_urls_json jsonb NOT NULL,
  useful_judgments bigint NOT NULL,
  useful_queries text NOT NULL,
  PRIMARY KEY (source_dataset, source_product_id)
);

\copy demo_runtime.catalog_source FROM '/data/catalog-source.csv' WITH (FORMAT csv, HEADER true)

CREATE TABLE demo_runtime.dataset_metrics (
  metric text PRIMARY KEY,
  value bigint NOT NULL,
  description text NOT NULL
);

CREATE TABLE demo_runtime.template_metadata (
  id integer PRIMARY KEY CHECK (id = 1),
  build_key text NOT NULL,
  built_at timestamptz NOT NULL
);
