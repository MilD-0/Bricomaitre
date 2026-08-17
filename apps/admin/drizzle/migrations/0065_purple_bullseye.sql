CREATE INDEX "idx_ai_proposals_run" ON "ai_proposals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_ad_costs_import_batch" ON "admin"."ad_costs" USING btree ("import_batch_id") WHERE "admin"."ad_costs"."import_batch_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_category" ON "analytics_events" USING btree ("category_id") WHERE "analytics_events"."category_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_brand" ON "analytics_events" USING btree ("brand_id") WHERE "analytics_events"."brand_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_analytics_journeys_first_order" ON "analytics_journeys" USING btree ("first_order_id") WHERE "analytics_journeys"."first_order_id" is not null;--> statement-breakpoint
CREATE INDEX "bulletin_post_reactions_user_id_idx" ON "admin"."bulletin_post_reactions" USING btree ("user_id") WHERE "admin"."bulletin_post_reactions"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "bulletin_reply_reactions_user_id_idx" ON "admin"."bulletin_reply_reactions" USING btree ("user_id") WHERE "admin"."bulletin_reply_reactions"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_status_history" ON "marketing_event_outbox" USING btree ("order_status_history_id") WHERE "marketing_event_outbox"."order_status_history_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_status_history" ON "meta_event_outbox" USING btree ("order_status_history_id") WHERE "meta_event_outbox"."order_status_history_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_analytics_event" ON "meta_event_outbox" USING btree ("analytics_event_id") WHERE "meta_event_outbox"."analytics_event_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_orders_promo_product" ON "orders" USING btree ("promo_product_id") WHERE "orders"."promo_product_id" is not null;