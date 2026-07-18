CREATE TYPE "public"."bundle_pricing_mode" AS ENUM('fixed', 'component_sum');--> statement-breakpoint
CREATE TABLE "ai_pricing_policies" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_minimum_gross_margin" numeric(5, 4) DEFAULT '0.1500' NOT NULL,
	"allow_request_override" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_pricing_policies_margin_check" CHECK ("ai_pricing_policies"."default_minimum_gross_margin" >= 0 and "ai_pricing_policies"."default_minimum_gross_margin" < 1)
);
--> statement-breakpoint
CREATE TABLE "bundle_components" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bundle_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"unit_purchase_price_snapshot" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_components_quantity_check" CHECK ("bundle_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bundle_listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"pricing_mode" "bundle_pricing_mode" DEFAULT 'fixed' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_id_bundle_listings_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_listings" ADD CONSTRAINT "bundle_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_components_bundle_product_unique" ON "bundle_components" USING btree ("bundle_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_bundle_components_product" ON "bundle_components" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_listings_product_unique" ON "bundle_listings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_bundle_listings_active" ON "bundle_listings" USING btree ("active");