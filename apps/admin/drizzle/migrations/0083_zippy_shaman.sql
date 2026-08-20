CREATE TABLE "admin"."analytics_economics_daily_facts" (
	"day" date PRIMARY KEY NOT NULL,
	"posted_orders" integer DEFAULT 0 NOT NULL,
	"paid_orders" integer DEFAULT 0 NOT NULL,
	"cost_complete_orders" integer DEFAULT 0 NOT NULL,
	"paid_profit_complete_orders" integer DEFAULT 0 NOT NULL,
	"gross_profit_dzd" numeric(18, 2),
	"adjusted_profit_dzd" numeric(18, 2),
	"ad_cost_dzd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"operating_cost_dzd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_profit_dzd" numeric(18, 2),
	"true_profit_dzd" numeric(18, 2),
	"automatic_paid_cod_dzd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"automatic_paid_fees_dzd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"automatic_paid_profit_dzd" numeric(18, 2),
	"fx_rate_used" numeric(16, 4) NOT NULL,
	"planning_return_rate_pct" numeric(7, 4) NOT NULL,
	"semantics_version" integer DEFAULT 1 NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_economics_daily_counts_nonnegative" CHECK (
      "admin"."analytics_economics_daily_facts"."posted_orders" >= 0
      and "admin"."analytics_economics_daily_facts"."paid_orders" >= 0
      and "admin"."analytics_economics_daily_facts"."cost_complete_orders" >= 0
      and "admin"."analytics_economics_daily_facts"."paid_profit_complete_orders" >= 0
    ),
	CONSTRAINT "analytics_economics_daily_fx_positive" CHECK ("admin"."analytics_economics_daily_facts"."fx_rate_used" > 0),
	CONSTRAINT "analytics_economics_daily_return_rate_range" CHECK ("admin"."analytics_economics_daily_facts"."planning_return_rate_pct" >= 0 and "admin"."analytics_economics_daily_facts"."planning_return_rate_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "admin"."analytics_order_cohort_facts" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"posted_day" date NOT NULL,
	"delivered_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"outcome" text NOT NULL,
	"submitted_cod_dzd" numeric(18, 2),
	"current_cod_dzd" numeric(18, 2),
	"delivery_fee_dzd" numeric(18, 2),
	"product_cost_dzd" numeric(18, 2),
	"gross_profit_dzd" numeric(18, 2),
	"automatic_paid_profit_dzd" numeric(18, 2),
	"cost_complete" boolean DEFAULT false NOT NULL,
	"wilaya_id" integer,
	"commune" text,
	"delivery_mode" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"semantics_version" integer DEFAULT 1 NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_cohort_attempt_count_nonnegative" CHECK ("admin"."analytics_order_cohort_facts"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."analytics_order_cohort_facts" ADD CONSTRAINT "analytics_order_cohort_facts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analytics_economics_daily_refreshed" ON "admin"."analytics_economics_daily_facts" USING btree ("refreshed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_cohort_posted_day" ON "admin"."analytics_order_cohort_facts" USING btree ("posted_day" DESC NULLS LAST,"order_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_cohort_outcome_posted" ON "admin"."analytics_order_cohort_facts" USING btree ("outcome","posted_day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_cohort_paid" ON "admin"."analytics_order_cohort_facts" USING btree ("paid_at" DESC NULLS LAST) WHERE "admin"."analytics_order_cohort_facts"."paid_at" is not null;--> statement-breakpoint
CREATE INDEX "idx_analytics_cohort_wilaya_posted" ON "admin"."analytics_order_cohort_facts" USING btree ("wilaya_id","posted_day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_cohort_meta_ad_posted" ON "admin"."analytics_order_cohort_facts" USING btree ("meta_ad_id","posted_day" DESC NULLS LAST) WHERE "admin"."analytics_order_cohort_facts"."meta_ad_id" is not null;