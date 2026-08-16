ALTER TABLE "asset_banners" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "featured_product_groups" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_cards" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "asset_banners" AS "target"
SET "sort_order" = "ordered"."sort_order"
FROM (
  SELECT "id", row_number() OVER (ORDER BY "updated_at" DESC, "id" DESC) - 1 AS "sort_order"
  FROM "asset_banners"
) AS "ordered"
WHERE "target"."id" = "ordered"."id";--> statement-breakpoint
UPDATE "featured_product_groups" AS "target"
SET "sort_order" = "ordered"."sort_order"
FROM (
  SELECT "id", row_number() OVER (ORDER BY "updated_at" DESC, "id" DESC) - 1 AS "sort_order"
  FROM "featured_product_groups"
) AS "ordered"
WHERE "target"."id" = "ordered"."id";--> statement-breakpoint
UPDATE "product_cards" AS "target"
SET "sort_order" = "ordered"."sort_order"
FROM (
  SELECT "id", row_number() OVER (ORDER BY "updated_at" DESC, "id" DESC) - 1 AS "sort_order"
  FROM "product_cards"
) AS "ordered"
WHERE "target"."id" = "ordered"."id";--> statement-breakpoint
CREATE INDEX "idx_asset_banners_sort_order" ON "asset_banners" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_cards_sort_order" ON "product_cards" USING btree ("sort_order");
