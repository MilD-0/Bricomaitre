CREATE TABLE "product_promo_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"promo_price" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_product_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_original_subtotal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_discount_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_final_subtotal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_promo_codes" ADD CONSTRAINT "product_promo_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_promo_codes_product_code_unique" ON "product_promo_codes" USING btree ("product_id","normalized_code");--> statement-breakpoint
CREATE INDEX "idx_product_promo_codes_code_active" ON "product_promo_codes" USING btree ("normalized_code","active");--> statement-breakpoint
CREATE INDEX "idx_product_promo_codes_product_active" ON "product_promo_codes" USING btree ("product_id","active");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_product_id_products_id_fk" FOREIGN KEY ("promo_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;