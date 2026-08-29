ALTER TABLE "brands" ADD CONSTRAINT "brands_engagement_counters_nonnegative_check" CHECK ("brands"."view_count" >= 0 and "brands"."add_to_cart_count" >= 0 and "brands"."checkout_count" >= 0 and "brands"."purchase_count" >= 0);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_popularity_score_nonnegative_check" CHECK ("brands"."popularity_score" >= 0);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_conversion_rate_nonnegative_check" CHECK ("brands"."conversion_rate" >= 0);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_engagement_counters_nonnegative_check" CHECK ("categories"."view_count" >= 0 and "categories"."add_to_cart_count" >= 0 and "categories"."checkout_count" >= 0 and "categories"."purchase_count" >= 0);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_popularity_score_nonnegative_check" CHECK ("categories"."popularity_score" >= 0);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_conversion_rate_nonnegative_check" CHECK ("categories"."conversion_rate" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative_check" CHECK ("products"."price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_old_price_nonnegative_check" CHECK ("products"."old_price" is null or "products"."old_price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_purchase_price_nonnegative_check" CHECK ("products"."purchase_price" is null or "products"."purchase_price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_inventory_quantity_nonnegative_check" CHECK ("products"."inventory_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_engagement_counters_nonnegative_check" CHECK ("products"."units_sold" >= 0 and "products"."view_count" >= 0 and "products"."add_to_cart_count" >= 0 and "products"."checkout_count" >= 0 and "products"."purchase_count" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_popularity_score_nonnegative_check" CHECK ("products"."popularity_score" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_conversion_rate_nonnegative_check" CHECK ("products"."conversion_rate" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_availability_status_check" CHECK ("products"."availability_status" in ('in_stock', 'out_of_stock'));