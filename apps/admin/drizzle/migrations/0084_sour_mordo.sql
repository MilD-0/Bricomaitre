CREATE TABLE "search_console_daily_appearances" (
	"day" date NOT NULL,
	"search_type" text DEFAULT 'web' NOT NULL,
	"appearance" text NOT NULL,
	"clicks" numeric(18, 4) DEFAULT '0' NOT NULL,
	"impressions" numeric(18, 4) DEFAULT '0' NOT NULL,
	"ctr" numeric(12, 8) DEFAULT '0' NOT NULL,
	"position" numeric(12, 6),
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_daily_appearances_day_search_type_appearance_pk" PRIMARY KEY("day","search_type","appearance")
);
--> statement-breakpoint
CREATE TABLE "search_console_daily_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"search_type" text DEFAULT 'web' NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"clicks" numeric(18, 4) DEFAULT '0' NOT NULL,
	"impressions" numeric(18, 4) DEFAULT '0' NOT NULL,
	"ctr" numeric(12, 8) DEFAULT '0' NOT NULL,
	"position" numeric(12, 6),
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_console_daily_totals" (
	"day" date NOT NULL,
	"search_type" text DEFAULT 'web' NOT NULL,
	"clicks" numeric(18, 4) DEFAULT '0' NOT NULL,
	"impressions" numeric(18, 4) DEFAULT '0' NOT NULL,
	"ctr" numeric(12, 8) DEFAULT '0' NOT NULL,
	"position" numeric(12, 6),
	"data_state" text DEFAULT 'final' NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_daily_totals_day_search_type_pk" PRIMARY KEY("day","search_type")
);
--> statement-breakpoint
CREATE TABLE "search_console_sitemaps" (
	"path" text PRIMARY KEY NOT NULL,
	"site_url" text NOT NULL,
	"type" text,
	"is_pending" boolean DEFAULT false NOT NULL,
	"is_sitemaps_index" boolean DEFAULT false NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"submitted_urls" integer DEFAULT 0 NOT NULL,
	"contents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_submitted_at" timestamp with time zone,
	"last_downloaded_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_console_sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"site_url" text NOT NULL,
	"since_day" date NOT NULL,
	"until_day" date NOT NULL,
	"totals_fetched" integer DEFAULT 0 NOT NULL,
	"detail_rows_fetched" integer DEFAULT 0 NOT NULL,
	"appearances_fetched" integer DEFAULT 0 NOT NULL,
	"urls_inspected" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_console_url_inspections" (
	"url" text PRIMARY KEY NOT NULL,
	"site_url" text NOT NULL,
	"verdict" text,
	"coverage_state" text,
	"robots_txt_state" text,
	"indexing_state" text,
	"page_fetch_state" text,
	"google_canonical" text,
	"user_canonical" text,
	"last_crawl_at" timestamp with time zone,
	"crawled_as" text,
	"referring_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sitemap_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rich_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inspected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_search_console_appearance_day" ON "search_console_daily_appearances" USING btree ("appearance","day" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "search_console_daily_dimensions_unique" ON "search_console_daily_rows" USING btree ("day","search_type","query","page","country","device");--> statement-breakpoint
CREATE INDEX "idx_search_console_rows_day" ON "search_console_daily_rows" USING btree ("day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_rows_query_day" ON "search_console_daily_rows" USING btree ("query","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_rows_page_day" ON "search_console_daily_rows" USING btree ("page","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_rows_device_day" ON "search_console_daily_rows" USING btree ("device","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_totals_type_day" ON "search_console_daily_totals" USING btree ("search_type","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_sitemaps_synced" ON "search_console_sitemaps" USING btree ("synced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_sync_started" ON "search_console_sync_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_sync_status_started" ON "search_console_sync_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_inspections_verdict" ON "search_console_url_inspections" USING btree ("verdict","inspected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_search_console_inspections_crawl" ON "search_console_url_inspections" USING btree ("last_crawl_at" DESC NULLS LAST);