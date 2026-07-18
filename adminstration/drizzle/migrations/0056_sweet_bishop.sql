CREATE TYPE "public"."ai_proposal_status" AS ENUM('proposed', 'approved', 'rejected', 'applied', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_surface" AS ENUM('admin', 'storefront');--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_use';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_catalog_propose';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_catalog_apply';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_analytics_query';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_pricing_analyze';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_pricing_apply';--> statement-breakpoint
ALTER TYPE "admin"."admin_role_permission" ADD VALUE 'ai_landing_publish';--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"surface" "ai_surface" NOT NULL,
	"actor_id" text,
	"session_key" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"proposal_type" text NOT NULL,
	"status" "ai_proposal_status" DEFAULT 'proposed' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"source_updated_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"reasoning" text,
	"requested_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint,
	"surface" "ai_surface" NOT NULL,
	"task" text NOT NULL,
	"status" "ai_run_status" DEFAULT 'running' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"actor_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_actor_updated" ON "ai_conversations" USING btree ("actor_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_session" ON "ai_conversations" USING btree ("session_key");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_expires" ON "ai_conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_messages_conversation_created" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_entity_status" ON "ai_proposals" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_requested_created" ON "ai_proposals" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_expires" ON "ai_proposals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_actor_started" ON "ai_runs" USING btree ("actor_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_status_started" ON "ai_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_conversation" ON "ai_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_ai_tool_calls_run" ON "ai_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_ai_tool_calls_tool_started" ON "ai_tool_calls" USING btree ("tool_name","started_at");