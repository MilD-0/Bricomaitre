CREATE TABLE "action_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"resource" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"entity_label" text NOT NULL,
	"operation" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_by" text,
	"created_by_name" text,
	"is_undone" boolean DEFAULT false NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	"redone_at" timestamp with time zone,
	"redone_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_action_logs_created_at" ON "action_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_action_logs_entity" ON "action_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_action_logs_resource" ON "action_logs" USING btree ("resource","created_at");