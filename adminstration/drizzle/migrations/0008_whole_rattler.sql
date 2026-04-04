ALTER TABLE "products" ADD COLUMN "inventory_quantity" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_products_barcode" ON "products" USING btree ("barcode");