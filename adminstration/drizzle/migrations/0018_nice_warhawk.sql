ALTER TABLE "import_batches" ADD COLUMN "unmatched_details" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "active" boolean DEFAULT true NOT NULL;