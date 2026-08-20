CREATE TABLE "meta_ads_breakdown_daily_insights" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"adset_id" text NOT NULL,
	"adset_name" text,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"breakdown_kind" text NOT NULL,
	"publisher_platform" text DEFAULT '' NOT NULL,
	"platform_position" text DEFAULT '' NOT NULL,
	"impression_device" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"spend" numeric(16, 4) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"outbound_clicks" numeric(14, 4) DEFAULT '0' NOT NULL,
	"landing_page_views" numeric(14, 4) DEFAULT '0' NOT NULL,
	"purchases" numeric(14, 4) DEFAULT '0' NOT NULL,
	"purchase_value" numeric(16, 2) DEFAULT '0' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads_delivery_entities" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text,
	"campaign_name" text,
	"name" text NOT NULL,
	"status" text,
	"effective_status" text,
	"objective" text,
	"optimization_goal" text,
	"billing_event" text,
	"bid_strategy" text,
	"daily_budget" numeric(16, 2),
	"lifetime_budget" numeric(16, 2),
	"budget_remaining" numeric(16, 2),
	"start_time" timestamp with time zone,
	"stop_time" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ads_delivery_entities_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ads_breakdown_daily_grain_unique" ON "meta_ads_breakdown_daily_insights" USING btree ("account_id","day","ad_id","breakdown_kind","publisher_platform","platform_position","impression_device","region");--> statement-breakpoint
CREATE INDEX "idx_meta_ads_breakdown_kind_day" ON "meta_ads_breakdown_daily_insights" USING btree ("breakdown_kind","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_breakdown_campaign_day" ON "meta_ads_breakdown_daily_insights" USING btree ("campaign_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_ads_delivery_entities_campaign" ON "meta_ads_delivery_entities" USING btree ("campaign_id","entity_type");--> statement-breakpoint
CREATE INDEX "idx_meta_ads_delivery_entities_status" ON "meta_ads_delivery_entities" USING btree ("entity_type","effective_status");