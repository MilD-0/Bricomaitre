CREATE TABLE "admin_mutation_idempotency" (
	"scope" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mutation_idempotency_scope_request_unique" ON "admin_mutation_idempotency" USING btree ("scope","request_id");