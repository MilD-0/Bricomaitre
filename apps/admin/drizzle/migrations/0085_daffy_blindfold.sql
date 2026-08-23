ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "gross_profit_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "adjusted_profit_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "ad_cost_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "ad_cost_dzd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "operating_cost_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "operating_cost_dzd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "net_profit_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "true_profit_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "automatic_paid_cod_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "automatic_paid_cod_dzd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "automatic_paid_fees_dzd" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "automatic_paid_fees_dzd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "admin"."analytics_economics_daily_facts" ALTER COLUMN "automatic_paid_profit_dzd" SET DATA TYPE numeric(20, 6);