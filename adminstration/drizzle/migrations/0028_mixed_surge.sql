CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_products_updated_at" ON "products" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_brand_updated_at" ON "products" USING btree ("brand_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_category_updated_at" ON "products" USING btree ("category_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_title_trgm" ON "products" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_products_sku_trgm" ON "products" USING gin ("sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_products_barcode_trgm" ON "products" USING gin ("barcode" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_orders_active_created_at" ON "orders" USING btree ("created_at" DESC NULLS LAST) WHERE "orders"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "idx_orders_active_confirmed_created_at" ON "orders" USING btree ("confirmed","created_at" DESC NULLS LAST) WHERE "orders"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "idx_po_stats_date" ON "processed_orders" USING btree (coalesce("encaissed_at", "delivered_at", "order_created_at"));--> statement-breakpoint
CREATE INDEX "idx_po_wilaya_stats_date" ON "processed_orders" USING btree ("wilaya",coalesce("encaissed_at", "delivered_at", "order_created_at"));--> statement-breakpoint
CREATE INDEX "idx_po_delivery_stats_date" ON "processed_orders" USING btree ("delivery_type",coalesce("encaissed_at", "delivered_at", "order_created_at"));
