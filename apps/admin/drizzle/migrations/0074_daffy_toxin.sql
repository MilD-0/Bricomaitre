ALTER TABLE "order_correction_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_customer_notes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_merge_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "order_correction_events" CASCADE;--> statement-breakpoint
DROP TABLE "order_customer_notes" CASCADE;--> statement-breakpoint
DROP TABLE "order_merge_events" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_not_merged_into_self_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_merged_into_order_id_orders_id_fk";
--> statement-breakpoint
DROP INDEX "idx_orders_archived_at";--> statement-breakpoint
DROP INDEX "idx_orders_merged_into";--> statement-breakpoint
DROP INDEX "idx_orders_active_created_at";--> statement-breakpoint
DROP INDEX "idx_orders_active_confirmed_created_at";--> statement-breakpoint
CREATE INDEX "idx_orders_created_desc" ON "orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orders_confirmed_created_desc" ON "orders" USING btree ("confirmed","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "archived_at";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "merged_into_order_id";