CREATE TABLE "storefront_order_idempotency" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"order_id" bigint,
	"meta_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront_order_idempotency" ADD CONSTRAINT "storefront_order_idempotency_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_storefront_order_idempotency_order" ON "storefront_order_idempotency" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_storefront_order_idempotency_expires" ON "storefront_order_idempotency" USING btree ("expires_at");