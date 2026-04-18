CREATE TABLE "analytics_paid_click_visits" (
	"visit_id" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"landing_url" text NOT NULL,
	"landing_path" text NOT NULL,
	"landing_query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landing_host" text,
	"referrer" text,
	"user_agent" text,
	"storefront_variant" text,
	"requested_variant" text,
	"experiment_mode" text,
	"experiment_source" text,
	"fbclid_raw" text,
	"fbc" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"paid_source" text NOT NULL,
	"journey_id" text,
	"session_id" text,
	"order_id" bigint,
	"entry_event_id" text,
	"last_event_name" text,
	"last_event_at" timestamp with time zone,
	"event_count" integer DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "visit_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "visit_id" text;--> statement-breakpoint
ALTER TABLE "analytics_paid_click_visits" ADD CONSTRAINT "analytics_paid_click_visits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_first_seen" ON "analytics_paid_click_visits" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_variant_first_seen" ON "analytics_paid_click_visits" USING btree ("storefront_variant","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_source_first_seen" ON "analytics_paid_click_visits" USING btree ("paid_source","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_journey" ON "analytics_paid_click_visits" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_session" ON "analytics_paid_click_visits" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_order" ON "analytics_paid_click_visits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_expires" ON "analytics_paid_click_visits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_visit" ON "analytics_events" USING btree ("visit_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orders_visit" ON "orders" USING btree ("visit_id");