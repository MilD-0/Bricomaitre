ALTER TABLE "order_line_items" ADD COLUMN "weight_kg_snapshot" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_kg" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_weight_nonnegative_check" CHECK ("order_line_items"."weight_kg_snapshot" is null or "order_line_items"."weight_kg_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_weight_nonnegative_check" CHECK ("products"."weight_kg" is null or "products"."weight_kg" >= 0);