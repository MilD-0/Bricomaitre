ALTER TABLE "brands" DROP CONSTRAINT "brands_engagement_counters_nonnegative_check";--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_popularity_score_nonnegative_check";--> statement-breakpoint
ALTER TABLE "brands" DROP CONSTRAINT "brands_conversion_rate_nonnegative_check";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_engagement_counters_nonnegative_check";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_popularity_score_nonnegative_check";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_conversion_rate_nonnegative_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_engagement_counters_nonnegative_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_popularity_score_nonnegative_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_conversion_rate_nonnegative_check";--> statement-breakpoint
DROP INDEX "idx_brands_popularity";--> statement-breakpoint
DROP INDEX "idx_brands_last_viewed_at";--> statement-breakpoint
DROP INDEX "idx_categories_popularity";--> statement-breakpoint
DROP INDEX "idx_categories_last_viewed_at";--> statement-breakpoint
DROP INDEX "idx_products_popularity";--> statement-breakpoint
DROP INDEX "idx_products_last_viewed_at";--> statement-breakpoint
DROP INDEX "analytics_acquisition_rollups_day_channel_evidence_unique";--> statement-breakpoint
DROP INDEX "analytics_ai_rollups_day_dimension_key_unique";--> statement-breakpoint
DROP INDEX "analytics_daily_rollups_day_dimension_key_unique";--> statement-breakpoint
DROP INDEX "analytics_distinct_members_day_metric_key_member_unique";--> statement-breakpoint
DROP INDEX "analytics_paid_click_rollups_dimensions_unique";--> statement-breakpoint
DROP INDEX "meta_event_daily_rollups_day_event_unique";--> statement-breakpoint
ALTER TABLE "analytics_acquisition_daily_rollups" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_ai_daily_rollups" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily_rollups" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_distinct_daily_members" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_paid_click_daily_rollups" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_event_daily_rollups" ADD COLUMN "day_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_acquisition_rollups_day_channel_evidence_unique" ON "analytics_acquisition_daily_rollups" USING btree ("day","day_timezone","channel","evidence");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_ai_rollups_day_dimension_key_unique" ON "analytics_ai_daily_rollups" USING btree ("day","day_timezone","dimension","dimension_key");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_day_dimension_key_unique" ON "analytics_daily_rollups" USING btree ("day","day_timezone","dimension","dimension_key");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_distinct_members_day_metric_key_member_unique" ON "analytics_distinct_daily_members" USING btree ("day","day_timezone","metric","dimension_key","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_paid_click_rollups_dimensions_unique" ON "analytics_paid_click_daily_rollups" USING btree ("day","day_timezone","variant","paid_source","has_order","landing_path");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_event_daily_rollups_day_event_unique" ON "meta_event_daily_rollups" USING btree ("day","day_timezone","event_name");--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "view_count";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "add_to_cart_count";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "checkout_count";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "purchase_count";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "popularity_score";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "conversion_rate";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "last_viewed_at";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "view_count";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "add_to_cart_count";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "checkout_count";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "purchase_count";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "popularity_score";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "conversion_rate";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "last_viewed_at";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "view_count";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "add_to_cart_count";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "checkout_count";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "purchase_count";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "popularity_score";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "conversion_rate";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "last_viewed_at";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_units_sold_nonnegative_check" CHECK ("products"."units_sold" >= 0);