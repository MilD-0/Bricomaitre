CREATE TABLE "admin"."order_inventory_allocations" (
	"order_id" bigint NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"legacy_scope_keys" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_inventory_allocations_order_id_product_id_pk" PRIMARY KEY("order_id","product_id"),
	CONSTRAINT "order_inventory_allocations_quantity_check" CHECK ("admin"."order_inventory_allocations"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."shopping_list_drafts" ADD COLUMN "allocation_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."order_inventory_allocations" ADD CONSTRAINT "order_inventory_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."order_inventory_allocations" ADD CONSTRAINT "order_inventory_allocations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_inventory_allocations_product_idx" ON "admin"."order_inventory_allocations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shopping_list_drafts_pending_allocation_idx" ON "admin"."shopping_list_drafts" USING btree ("allocation_version") WHERE "admin"."shopping_list_drafts"."allocation_version" = 0;