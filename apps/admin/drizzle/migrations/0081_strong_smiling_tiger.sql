CREATE TABLE "admin"."ecotrack_order_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"reason" text,
	"details" text,
	"effective_at" timestamp with time zone,
	"postponed_to" date,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_status_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"status" text NOT NULL,
	"effective_at" timestamp with time zone,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'orders_status' NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "current_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "current_amount_source" text;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "delivery_tariff" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "return_tariff" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "stop_desk" boolean;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "provider_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "raw_order_payload" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "last_order_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "outbound_clicks" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "unique_outbound_clicks" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_plays" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_p25_watched" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_p50_watched" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_p75_watched" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_p95_watched" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_p100_watched" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "video_average_watch_seconds" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "quality_ranking" text;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "engagement_rate_ranking" text;--> statement-breakpoint
ALTER TABLE "meta_ads_daily_insights" ADD COLUMN "conversion_rate_ranking" text;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_activities" ADD CONSTRAINT "ecotrack_order_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_status_observations" ADD CONSTRAINT "ecotrack_order_status_observations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_activities_source_unique" ON "admin"."ecotrack_order_activities" USING btree ("order_id","source_key");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_activities_order_time" ON "admin"."ecotrack_order_activities" USING btree ("order_id","effective_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_activities_postponed" ON "admin"."ecotrack_order_activities" USING btree ("postponed_to") WHERE "admin"."ecotrack_order_activities"."postponed_to" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_status_observations_source_unique" ON "admin"."ecotrack_order_status_observations" USING btree ("order_id","source_key");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_status_observations_order_time" ON "admin"."ecotrack_order_status_observations" USING btree ("order_id","first_observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_status_observations_status_time" ON "admin"."ecotrack_order_status_observations" USING btree ("status","first_observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_order_synced" ON "admin"."ecotrack_order_states" USING btree ("last_order_synced_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD CONSTRAINT "ecotrack_order_states_current_amount_nonnegative_check" CHECK ("admin"."ecotrack_order_states"."current_amount" is null or "admin"."ecotrack_order_states"."current_amount" >= 0);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD CONSTRAINT "ecotrack_order_states_delivery_tariff_nonnegative_check" CHECK ("admin"."ecotrack_order_states"."delivery_tariff" is null or "admin"."ecotrack_order_states"."delivery_tariff" >= 0);--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD CONSTRAINT "ecotrack_order_states_return_tariff_nonnegative_check" CHECK ("admin"."ecotrack_order_states"."return_tariff" is null or "admin"."ecotrack_order_states"."return_tariff" >= 0);