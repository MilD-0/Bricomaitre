CREATE TABLE "order_correction_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"correction_type" text NOT NULL,
	"reason" text NOT NULL,
	"previous_status" integer,
	"corrected_status" integer,
	"previous_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"corrected_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_customer_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"normalized_phone" text NOT NULL,
	"note" text NOT NULL,
	"refusal_reason" text,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_merge_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_order_id" bigint NOT NULL,
	"target_order_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_merge_distinct_orders_check" CHECK ("order_merge_events"."source_order_id" <> "order_merge_events"."target_order_id")
);
--> statement-breakpoint
DROP INDEX "idx_products_sku";--> statement-breakpoint
DROP INDEX "idx_products_barcode";--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD COLUMN "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD COLUMN "confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "normalized_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "product_subtotal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "merged_into_order_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "map_url" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "instagram_url" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "ai_provider" text DEFAULT 'environment' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "ai_model" text DEFAULT 'gpt-5-mini' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "ai_fallback_model" text;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "ai_max_context_products" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_settings" ADD COLUMN "ai_response_cache_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_correction_events" ADD CONSTRAINT "order_correction_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_merge_events" ADD CONSTRAINT "order_merge_events_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_merge_events" ADD CONSTRAINT "order_merge_events_target_order_id_orders_id_fk" FOREIGN KEY ("target_order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_corrections_order_created" ON "order_correction_events" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_customer_notes_phone_created" ON "order_customer_notes" USING btree ("normalized_phone","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_merge_source" ON "order_merge_events" USING btree ("source_order_id");--> statement-breakpoint
CREATE INDEX "idx_order_merge_target" ON "order_merge_events" USING btree ("target_order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merged_into_order_id_orders_id_fk" FOREIGN KEY ("merged_into_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_normalized_phone_created" ON "orders" USING btree ("normalized_phone","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orders_merged_into" ON "orders" USING btree ("merged_into_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_nonempty_unique" ON "products" USING btree (lower(btrim("sku"))) WHERE nullif(btrim("products"."sku"), '') is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_nonempty_unique" ON "products" USING btree (lower(btrim("barcode"))) WHERE nullif(btrim("products"."barcode"), '') is not null;--> statement-breakpoint
CREATE INDEX "idx_products_archived_at" ON "products" USING btree ("archived_at");--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_confidence_check" CHECK ("ai_proposals"."confidence" is null or ("ai_proposals"."confidence" >= 0 and "ai_proposals"."confidence" <= 1));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_self_parent_check" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_not_merged_into_self_check" CHECK ("orders"."merged_into_order_id" is null or "orders"."merged_into_order_id" <> "orders"."id");