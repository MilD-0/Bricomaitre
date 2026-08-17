CREATE TABLE "meta_ads_daily_insights" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"account_id" text NOT NULL,
	"account_currency" text NOT NULL,
	"account_timezone" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"adset_id" text NOT NULL,
	"adset_name" text,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"objective" text,
	"attribution_setting" text NOT NULL,
	"action_report_time" text NOT NULL,
	"attribution_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spend" numeric(16, 4) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"inline_link_clicks" bigint DEFAULT 0 NOT NULL,
	"landing_page_views" numeric(14, 4) DEFAULT '0' NOT NULL,
	"add_to_carts" numeric(14, 4) DEFAULT '0' NOT NULL,
	"initiate_checkouts" numeric(14, 4) DEFAULT '0' NOT NULL,
	"leads" numeric(14, 4) DEFAULT '0' NOT NULL,
	"purchases" numeric(14, 4) DEFAULT '0' NOT NULL,
	"purchase_value" numeric(16, 2) DEFAULT '0' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads_sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"api_version" text NOT NULL,
	"account_id" text NOT NULL,
	"account_currency" text,
	"account_timezone" text,
	"since_day" date NOT NULL,
	"until_day" date NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"rows_fetched" integer DEFAULT 0 NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_daily_insights_grain_unique" ON "meta_ads_daily_insights" USING btree ("account_id","day","ad_id","action_report_time","attribution_setting");--> statement-breakpoint
CREATE INDEX "idx_meta_ads_insights_campaign_day" ON "meta_ads_daily_insights" USING btree ("campaign_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_insights_adset_day" ON "meta_ads_daily_insights" USING btree ("adset_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_insights_ad_day" ON "meta_ads_daily_insights" USING btree ("ad_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_sync_runs_started" ON "meta_ads_sync_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_sync_runs_status_started" ON "meta_ads_sync_runs" USING btree ("status","started_at" DESC NULLS LAST);