ALTER TABLE "orders" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_orders_archived_at" ON "orders" USING btree ("archived_at");--> statement-breakpoint
UPDATE "orders"
SET "archived_at" = COALESCE("archived_at", "created_at")
WHERE "created_at" < TIMESTAMPTZ '2026-01-01T00:00:00.000Z';
