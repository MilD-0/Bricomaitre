CREATE TABLE "admin"."shopping_list_drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope_key" text NOT NULL,
	"source_mode" text NOT NULL,
	"order_ids" bigint[] DEFAULT '{}' NOT NULL,
	"title" text NOT NULL,
	"draft_items" jsonb NOT NULL,
	"generated_items" jsonb NOT NULL,
	"orders_snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"updated_by" text,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_drafts_scope_key_unique" ON "admin"."shopping_list_drafts" USING btree ("scope_key");--> statement-breakpoint
CREATE INDEX "shopping_list_drafts_source_updated_idx" ON "admin"."shopping_list_drafts" USING btree ("source_mode","updated_at");