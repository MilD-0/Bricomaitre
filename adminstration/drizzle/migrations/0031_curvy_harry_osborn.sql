DROP INDEX "idx_orders_public_token";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_token_unique" ON "orders" USING btree ("public_token");