ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "mongo_id" text;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "mongo_id" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "mongo_id" text;

CREATE INDEX IF NOT EXISTS "idx_brands_mongo_id" ON "brands" USING btree ("mongo_id");
CREATE INDEX IF NOT EXISTS "idx_categories_mongo_id" ON "categories" USING btree ("mongo_id");
CREATE INDEX IF NOT EXISTS "idx_orders_mongo_id" ON "orders" USING btree ("mongo_id");
