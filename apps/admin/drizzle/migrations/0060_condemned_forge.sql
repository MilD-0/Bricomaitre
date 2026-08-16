CREATE TABLE "analytics_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"dimension" text NOT NULL,
	"dimension_key" text DEFAULT '' NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"journeys" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"product_views" integer DEFAULT 0 NOT NULL,
	"add_to_carts" integer DEFAULT 0 NOT NULL,
	"checkout_starts" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL,
	"zero_result_searches" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_analytics_paid_click_first_seen";--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_day_dimension_key_unique" ON "analytics_daily_rollups" USING btree ("day","dimension","dimension_key");--> statement-breakpoint
CREATE INDEX "idx_analytics_daily_rollups_dimension_day" ON "analytics_daily_rollups" USING btree ("dimension","day");--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_event_time" ON "meta_event_outbox" USING btree ("event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_first_seen" ON "analytics_paid_click_visits" USING btree ("first_seen_at" DESC NULLS LAST,"visit_id" DESC NULLS LAST);