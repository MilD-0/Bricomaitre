-- Custom SQL migration file, put your code below! --
CREATE SCHEMA IF NOT EXISTS "admin";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'admin_user_role' AND n.nspname = 'admin'
  ) THEN
    CREATE TYPE "admin"."admin_user_role" AS ENUM('viewer', 'employee', 'admin', 'developer');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'admin_role_permission' AND n.nspname = 'admin'
  ) THEN
    CREATE TYPE "admin"."admin_role_permission" AS ENUM(
      'products_write',
      'orders_write',
      'assets_write',
      'brands_categories_write',
      'bulletin_moderate',
      'ops_view',
      'settings_manage'
    );
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "admin"."admin_user_role"
  USING "role"::text::"admin"."admin_user_role";
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'viewer'::"admin"."admin_user_role";
--> statement-breakpoint
ALTER TABLE "user_access_grants"
  ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_access_grants"
  ALTER COLUMN "role" TYPE "admin"."admin_user_role"
  USING "role"::text::"admin"."admin_user_role";
--> statement-breakpoint
ALTER TABLE "user_access_grants"
  ALTER COLUMN "role" SET DEFAULT 'viewer'::"admin"."admin_user_role";
--> statement-breakpoint
ALTER TABLE "role_definition_permissions"
  ALTER COLUMN "permission" TYPE "admin"."admin_role_permission"
  USING "permission"::text::"admin"."admin_role_permission";
--> statement-breakpoint
ALTER TABLE "action_logs" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ad_costs" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "accounts" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_post_attachments" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_post_reactions" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_post_tags" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_posts" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_replies" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_reply_reactions" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "bulletin_tags" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ecotrack_communes" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ecotrack_service_fees" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ecotrack_sync_runs" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ecotrack_weight_fees" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "ecotrack_wilayas" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "import_batches" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "migration_id_map" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "processed_order_products" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "processed_orders" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "role_definition_permissions" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "role_definitions" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "sessions" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "user_access_grants" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "users" SET SCHEMA "admin";
--> statement-breakpoint
ALTER TABLE "verification_tokens" SET SCHEMA "admin";
--> statement-breakpoint
DROP TYPE IF EXISTS "user_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "role_permission";
