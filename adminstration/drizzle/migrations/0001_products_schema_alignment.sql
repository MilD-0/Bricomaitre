ALTER TABLE "products" ADD COLUMN "slug" text;
--> statement-breakpoint
UPDATE "products"
SET "slug" = lower(regexp_replace(coalesce("title", 'product-' || "id"::text), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || "id"::text
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "in_stock" boolean;
--> statement-breakpoint
UPDATE "products"
SET "in_stock" = CASE
  WHEN "stock" IS NULL THEN true
  WHEN "stock" > 0 THEN true
  ELSE false
END
WHERE "in_stock" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "in_stock" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "in_stock" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "requires_shipping" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_digital" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight" numeric(10, 3);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_unit" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "dimension_unit" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_class" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "availability_status" text DEFAULT 'in_stock' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "meta_keywords" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "published_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "units_sold" TYPE bigint USING "units_sold"::bigint;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "units_sold" SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "featured";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "features";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "features_ar";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_descs";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_descs_ar";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_icons";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_values";
--> statement-breakpoint
CREATE INDEX "idx_products_slug" ON "products" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "idx_products_sku" ON "products" USING btree ("sku");
