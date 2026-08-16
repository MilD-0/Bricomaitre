ALTER TABLE "import_batches"
ADD COLUMN "unmatched_details" jsonb DEFAULT '[]'::jsonb NOT NULL;
