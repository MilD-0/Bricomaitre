ALTER TABLE "orders" ADD COLUMN "public_token" text;--> statement-breakpoint
CREATE INDEX "idx_orders_public_token" ON "orders" USING btree ("public_token");