CREATE TABLE "analytics_acquisition_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"channel" text NOT NULL,
	"evidence" text NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_ai_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"dimension" text NOT NULL,
	"dimension_key" text DEFAULT '' NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"result_clicks" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms_total" bigint DEFAULT 0 NOT NULL,
	"duration_samples" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"journey_id" text NOT NULL,
	"visit_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"entry_path" text NOT NULL,
	"referrer_domain" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"channel" text NOT NULL,
	"evidence" text NOT NULL,
	"has_meta_click_id" boolean DEFAULT false NOT NULL,
	"has_google_click_id" boolean DEFAULT false NOT NULL,
	"has_tiktok_click_id" boolean DEFAULT false NOT NULL,
	"locale" text,
	"viewport_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_ai_influence" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"semantics_version" text NOT NULL,
	"level" text NOT NULL,
	"same_session" boolean DEFAULT false NOT NULL,
	"source_session_id" text,
	"opened_at" timestamp with time zone,
	"engaged_at" timestamp with time zone,
	"recommendation_clicked_at" timestamp with time zone,
	"clicked_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_product_ordered" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_ai_influence_level_check" CHECK ("order_ai_influence"."level" in ('none', 'opened', 'engaged', 'recommendation_clicked', 'recommended_product_ordered'))
);
--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "evidence" text DEFAULT 'campaign_utm' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "session_channel" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "session_evidence" text DEFAULT 'invalid_referrer' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "source_session_id" text;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "referrer_domain" text;--> statement-breakpoint
ALTER TABLE "order_acquisition_attribution" ADD COLUMN "session_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_journey_id_analytics_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ai_influence" ADD CONSTRAINT "order_ai_influence_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_acquisition_rollups_day_channel_evidence_unique" ON "analytics_acquisition_daily_rollups" USING btree ("day","channel","evidence");--> statement-breakpoint
CREATE INDEX "idx_analytics_acquisition_rollups_channel_day" ON "analytics_acquisition_daily_rollups" USING btree ("channel","day");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_ai_rollups_day_dimension_key_unique" ON "analytics_ai_daily_rollups" USING btree ("day","dimension","dimension_key");--> statement-breakpoint
CREATE INDEX "idx_analytics_ai_rollups_dimension_day" ON "analytics_ai_daily_rollups" USING btree ("dimension","day");--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_started" ON "analytics_sessions" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_journey_started" ON "analytics_sessions" USING btree ("journey_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_channel_started" ON "analytics_sessions" USING btree ("channel","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_ai_influence_level_captured" ON "order_ai_influence" USING btree ("level","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_ai_influence_source_session" ON "order_ai_influence" USING btree ("source_session_id") WHERE "order_ai_influence"."source_session_id" is not null;