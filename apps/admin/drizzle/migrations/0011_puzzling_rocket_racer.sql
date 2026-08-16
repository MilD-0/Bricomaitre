DROP INDEX "idx_products_slug";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "title_en";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "description_en";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "requires_shipping";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "properties";