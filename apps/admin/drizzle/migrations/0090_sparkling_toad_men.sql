ALTER TABLE "orders" ADD COLUMN "public_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_orders_public_token_expires" ON "orders" USING btree ("public_token_expires_at");--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_quantity_positive_check" CHECK ("order_line_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_amounts_nonnegative_check" CHECK ("order_line_items"."original_unit_price" >= 0
        and "order_line_items"."effective_unit_price" >= 0
        and ("order_line_items"."unit_purchase_price_snapshot" is null or "order_line_items"."unit_purchase_price_snapshot" >= 0)
        and "order_line_items"."discount_amount" >= 0
        and "order_line_items"."line_total" >= 0);--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_status_check" CHECK ("order_status_history"."status" between 0 and 11);--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_no_answer_count_check" CHECK ("order_status_history"."no_answer_count" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_state_check" CHECK ("orders"."state" is null or "orders"."state" between 1 and 58);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_check" CHECK ("orders"."delivery" in (0, 1));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."confirmed" between 0 and 11);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_no_answer_count_check" CHECK ("orders"."no_answer_count" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_nonnegative_check" CHECK ("orders"."del_pr" is null or "orders"."del_pr" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_commercial_amounts_nonnegative_check" CHECK (("orders"."product_subtotal" is null or "orders"."product_subtotal" >= 0)
        and ("orders"."total_amount" is null or "orders"."total_amount" >= 0)
        and ("orders"."price" is null or "orders"."price" >= 0)
        and ("orders"."promo_original_subtotal" is null or "orders"."promo_original_subtotal" >= 0)
        and ("orders"."promo_discount_amount" is null or "orders"."promo_discount_amount" >= 0)
        and ("orders"."promo_final_subtotal" is null or "orders"."promo_final_subtotal" >= 0));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_public_token_expiry_check" CHECK ("orders"."public_token_expires_at" is null or "orders"."public_token" is not null);