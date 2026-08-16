CREATE TYPE "user_role" AS ENUM('viewer', 'employee', 'admin', 'developer');
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'viewer' NOT NULL;
