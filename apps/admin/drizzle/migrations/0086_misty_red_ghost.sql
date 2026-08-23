ALTER TABLE "analytics_ai_daily_rollups" ADD COLUMN "cancelled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_ai_daily_rollups" ADD COLUMN "helpful" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_ai_daily_rollups" ADD COLUMN "not_helpful" integer DEFAULT 0 NOT NULL;