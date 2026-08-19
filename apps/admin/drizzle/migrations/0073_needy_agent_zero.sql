ALTER TABLE "bundle_components" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bundle_listings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "storefront_content_pages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bundle_components" CASCADE;--> statement-breakpoint
DROP TABLE "bundle_listings" CASCADE;--> statement-breakpoint
DROP TABLE "storefront_content_pages" CASCADE;--> statement-breakpoint
DROP INDEX "idx_storefront_announcements_schedule";--> statement-breakpoint
ALTER TABLE "storefront_settings" DROP COLUMN "instagram_url";--> statement-breakpoint
ALTER TABLE "storefront_settings" DROP COLUMN "opening_hours";--> statement-breakpoint
ALTER TABLE "storefront_settings" DROP COLUMN "ai_provider";--> statement-breakpoint
ALTER TABLE "storefront_announcements" DROP COLUMN "link_label";--> statement-breakpoint
ALTER TABLE "storefront_announcements" DROP COLUMN "link_url";--> statement-breakpoint
ALTER TABLE "storefront_announcements" DROP COLUMN "starts_at";--> statement-breakpoint
ALTER TABLE "storefront_announcements" DROP COLUMN "ends_at";--> statement-breakpoint
DROP TYPE "public"."bundle_pricing_mode";