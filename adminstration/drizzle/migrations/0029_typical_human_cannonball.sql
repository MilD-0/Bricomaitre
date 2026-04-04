ALTER TABLE "brands" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
WITH prepared AS (
  SELECT
    id,
    CASE
      WHEN trimmed_slug = '' THEN 'brand-' || id::text
      ELSE trimmed_slug
    END AS base_slug
  FROM (
    SELECT
      id,
      trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')) AS trimmed_slug
    FROM "brands"
  ) normalized
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS duplicate_rank
  FROM prepared
)
UPDATE "brands" AS brands
SET "slug" = CASE
  WHEN ranked.duplicate_rank = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || brands.id::text
END
FROM ranked
WHERE brands.id = ranked.id;--> statement-breakpoint
WITH prepared AS (
  SELECT
    id,
    CASE
      WHEN trimmed_slug = '' THEN 'category-' || id::text
      ELSE trimmed_slug
    END AS base_slug
  FROM (
    SELECT
      id,
      trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')) AS trimmed_slug
    FROM "categories"
  ) normalized
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS duplicate_rank
  FROM prepared
)
UPDATE "categories" AS categories
SET "slug" = CASE
  WHEN ranked.duplicate_rank = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || categories.id::text
END
FROM ranked
WHERE categories.id = ranked.id;--> statement-breakpoint
WITH prepared AS (
  SELECT
    id,
    CASE
      WHEN trimmed_slug = '' THEN 'product-' || id::text
      ELSE trimmed_slug
    END AS base_slug
  FROM (
    SELECT
      id,
      trim(both '-' from regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g')) AS trimmed_slug
    FROM "products"
  ) normalized
),
ranked AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY id) AS duplicate_rank
  FROM prepared
)
UPDATE "products" AS products
SET "slug" = CASE
  WHEN ranked.duplicate_rank = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || products.id::text
END
FROM ranked
WHERE products.id = ranked.id;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");
