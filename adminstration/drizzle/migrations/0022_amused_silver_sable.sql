ALTER TABLE "products" ADD COLUMN "mongo_id" text;--> statement-breakpoint
CREATE INDEX "idx_products_mongo_id" ON "products" USING btree ("mongo_id");