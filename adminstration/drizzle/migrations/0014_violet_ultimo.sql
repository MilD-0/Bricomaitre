ALTER TABLE "brands" ADD COLUMN "is_active" boolean;--> statement-breakpoint
UPDATE "brands" SET "is_active" = "featured";--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "is_active" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "is_active" boolean;--> statement-breakpoint
UPDATE "categories" SET "is_active" = "featured";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "is_active" SET NOT NULL;
