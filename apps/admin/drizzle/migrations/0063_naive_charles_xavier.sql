ALTER TABLE "admin"."accounts" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."accounts" ADD COLUMN "id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."accounts" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."accounts" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."accounts" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD COLUMN "id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "email_verified_flag" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."verification_tokens" ADD COLUMN "id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_id_unique" ON "admin"."accounts" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_id_unique" ON "admin"."sessions" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_id_unique" ON "admin"."verification_tokens" USING btree ("id");