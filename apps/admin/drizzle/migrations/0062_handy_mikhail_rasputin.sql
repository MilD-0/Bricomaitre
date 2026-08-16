CREATE TABLE "analytics_distinct_daily_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension_key" text DEFAULT '' NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_paid_click_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"variant" text NOT NULL,
	"paid_source" text NOT NULL,
	"has_order" integer DEFAULT 0 NOT NULL,
	"landing_path" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"landed_only" integer DEFAULT 0 NOT NULL,
	"viewed_product" integer DEFAULT 0 NOT NULL,
	"added_to_cart" integer DEFAULT 0 NOT NULL,
	"began_checkout" integer DEFAULT 0 NOT NULL,
	"created_order" integer DEFAULT 0 NOT NULL,
	"purchased" integer DEFAULT 0 NOT NULL,
	"errored" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_distinct_members_day_metric_key_member_unique" ON "analytics_distinct_daily_members" USING btree ("day","metric","dimension_key","member_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_distinct_members_metric_day_key" ON "analytics_distinct_daily_members" USING btree ("metric","day","dimension_key");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_paid_click_rollups_dimensions_unique" ON "analytics_paid_click_daily_rollups" USING btree ("day","variant","paid_source","has_order","landing_path");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_rollups_day" ON "analytics_paid_click_daily_rollups" USING btree ("day");