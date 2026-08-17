CREATE TABLE "order_acquisition_attribution" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"semantics_version" text NOT NULL,
	"attribution_model" text NOT NULL,
	"channel" text NOT NULL,
	"landing_path" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "unit_purchase_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "purchase_cost_source" text DEFAULT 'legacy_not_recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD CONSTRAINT "order_acquisition_attribution_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_acquisition_channel_captured" ON "order_acquisition_attribution" USING btree ("channel","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_acquisition_meta_campaign" ON "order_acquisition_attribution" USING btree ("meta_campaign_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_acquisition_meta_adset" ON "order_acquisition_attribution" USING btree ("meta_adset_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_acquisition_meta_ad" ON "order_acquisition_attribution" USING btree ("meta_ad_id","captured_at" DESC NULLS LAST);