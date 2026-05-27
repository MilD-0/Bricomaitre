CREATE TABLE "admin"."ad_spend_import_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"file_name" text NOT NULL,
	"rate" numeric(12, 4) NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"uploaded_by_email" text,
	"uploaded_by_name" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_spend_import_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
ALTER TABLE "admin"."ad_costs" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "admin"."ad_costs" ADD CONSTRAINT "ad_costs_import_batch_id_ad_spend_import_batches_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "admin"."ad_spend_import_batches"("batch_id") ON DELETE cascade ON UPDATE no action;