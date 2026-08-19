CREATE TABLE "admin"."profit_tracker_days" (
	"day" date PRIMARY KEY NOT NULL,
	"spend_eur" numeric(16, 4),
	"fb_purchases" numeric(14, 4),
	"cpm" numeric(16, 4),
	"ctr" numeric(9, 4),
	"link_clicks" integer,
	"landing_page_views" numeric(14, 4),
	"gross_profit_dzd" numeric(18, 2),
	"return_rate_pct" numeric(7, 4),
	"confirmed_orders" integer,
	"note" text,
	"raw_meta_json" jsonb,
	"fx_rate_used" numeric(16, 4) NOT NULL,
	"meta_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profit_tracker_days_spend_nonnegative_check" CHECK ("admin"."profit_tracker_days"."spend_eur" >= 0),
	CONSTRAINT "profit_tracker_days_fx_positive_check" CHECK ("admin"."profit_tracker_days"."fx_rate_used" > 0),
	CONSTRAINT "profit_tracker_days_return_rate_check" CHECK ("admin"."profit_tracker_days"."return_rate_pct" >= 0 and "admin"."profit_tracker_days"."return_rate_pct" <= 100),
	CONSTRAINT "profit_tracker_days_confirmed_nonnegative_check" CHECK ("admin"."profit_tracker_days"."confirmed_orders" >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."profit_tracker_operating_costs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount_dzd" numeric(18, 2) NOT NULL,
	"period" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profit_tracker_costs_amount_nonnegative_check" CHECK ("admin"."profit_tracker_operating_costs"."amount_dzd" >= 0),
	CONSTRAINT "profit_tracker_costs_period_check" CHECK ("admin"."profit_tracker_operating_costs"."period" in ('monthly', 'once')),
	CONSTRAINT "profit_tracker_costs_date_order_check" CHECK ("admin"."profit_tracker_operating_costs"."end_date" is null or "admin"."profit_tracker_operating_costs"."end_date" >= "admin"."profit_tracker_operating_costs"."start_date")
);
--> statement-breakpoint
CREATE TABLE "admin"."profit_tracker_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fx_rate" numeric(16, 4) DEFAULT '280' NOT NULL,
	"default_return_rate" numeric(7, 4) DEFAULT '10' NOT NULL,
	"rest_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profit_tracker_settings_singleton_check" CHECK ("admin"."profit_tracker_settings"."id" = 1),
	CONSTRAINT "profit_tracker_settings_fx_positive_check" CHECK ("admin"."profit_tracker_settings"."fx_rate" > 0),
	CONSTRAINT "profit_tracker_settings_return_rate_check" CHECK ("admin"."profit_tracker_settings"."default_return_rate" >= 0 and "admin"."profit_tracker_settings"."default_return_rate" <= 100)
);
--> statement-breakpoint
CREATE INDEX "idx_profit_tracker_days_meta_synced" ON "admin"."profit_tracker_days" USING btree ("meta_synced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_profit_tracker_costs_period_start" ON "admin"."profit_tracker_operating_costs" USING btree ("period","start_date");--> statement-breakpoint
CREATE INDEX "idx_profit_tracker_costs_end" ON "admin"."profit_tracker_operating_costs" USING btree ("end_date");