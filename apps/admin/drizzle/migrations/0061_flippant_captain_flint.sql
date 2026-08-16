CREATE TABLE "meta_event_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"event_name" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"pixel_fired" integer DEFAULT 0 NOT NULL,
	"capi_sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"last_occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meta_event_daily_rollups_day_event_unique" ON "meta_event_daily_rollups" USING btree ("day","event_name");--> statement-breakpoint
CREATE INDEX "idx_meta_event_daily_rollups_event_day" ON "meta_event_daily_rollups" USING btree ("event_name","day");