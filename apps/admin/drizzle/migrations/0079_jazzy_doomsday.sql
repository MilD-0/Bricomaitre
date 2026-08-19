ALTER TABLE "admin"."role_definition_permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "admin"."admin_role_permission";--> statement-breakpoint
CREATE TYPE "admin"."admin_role_permission" AS ENUM('products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'bulletin_moderate', 'ops_view', 'analytics_manage', 'settings_manage');--> statement-breakpoint
ALTER TABLE "admin"."role_definition_permissions" ALTER COLUMN "permission" SET DATA TYPE "admin"."admin_role_permission" USING "permission"::"admin"."admin_role_permission";