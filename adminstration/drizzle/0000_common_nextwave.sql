CREATE TYPE "public"."delivery_method" AS ENUM('home_delivery', 'pickup', 'express', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('facebook', 'instagram', 'google', 'tiktok', 'other');--> statement-breakpoint
CREATE TABLE "ad_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"platform" "platform" DEFAULT 'facebook' NOT NULL,
	"campaign_name" varchar(160),
	"campaign_id" varchar(120),
	"spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"conversions" integer,
	"reach" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"image" text,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_en" varchar(120),
	"name_ar" varchar(120),
	"image" text,
	"parent_id" uuid,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" varchar(120) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"matched_orders" integer DEFAULT 0 NOT NULL,
	"unmatched_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_range_start" timestamp with time zone,
	"date_range_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "migration_id_map" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "migration_id_map_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" varchar(60) NOT NULL,
	"mongo_id" varchar(64) NOT NULL,
	"postgres_id" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" uuid,
	"title_snapshot" varchar(180) NOT NULL,
	"sku_snapshot" varchar(80),
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"variant" varchar(120),
	CONSTRAINT "order_line_items_pk" PRIMARY KEY("order_id","line_number")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"changed_by" varchar(255),
	"changed_by_name" varchar(120),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"state" varchar(120),
	"city" varchar(120),
	"home_address" text,
	"email" varchar(255),
	"phone_number_1" varchar(30) NOT NULL,
	"phone_number_2" varchar(30),
	"delivery_method" "delivery_method" DEFAULT 'home_delivery' NOT NULL,
	"delivery_price" numeric(12, 2),
	"total_price" numeric(12, 2),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"confirmed_by" varchar(255),
	"confirmed_by_name" varchar(120),
	"confirmed_at" timestamp with time zone,
	"ecotrack_status" varchar(120),
	"ecotrack_status_last_update" timestamp with time zone,
	"ecotrack_status_data" jsonb,
	"ecotrack_reference" varchar(120),
	"ecotrack_tracking_number" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(120) NOT NULL,
	"tracking" varchar(120) NOT NULL,
	"customer_name" varchar(180) DEFAULT '' NOT NULL,
	"wilaya" varchar(120) DEFAULT '' NOT NULL,
	"commune" varchar(120) DEFAULT '' NOT NULL,
	"amount_collected" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"product_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"profit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"delivery_type" varchar(120) DEFAULT '' NOT NULL,
	"delivered_at" timestamp with time zone,
	"order_created_at" timestamp with time zone,
	"encaissed_at" timestamp with time zone,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_batch_id" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_orders_tracking_unique" UNIQUE("tracking")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"title_en" varchar(180),
	"title_ar" varchar(180),
	"description_en" text,
	"description_ar" text,
	"old_price" numeric(12, 2),
	"show_percentage" numeric(5, 2),
	"price" numeric(12, 2) NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand_id" uuid,
	"category_id" uuid,
	"stock" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sku" varchar(80),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD CONSTRAINT "processed_orders_import_batch_id_import_batches_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("batch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_costs_date_platform_campaign_unique" ON "ad_costs" USING btree ("date","platform","campaign_name");--> statement-breakpoint
CREATE INDEX "ad_costs_date_idx" ON "ad_costs" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_unique" ON "brands" USING btree ("name");--> statement-breakpoint
CREATE INDEX "brands_featured_idx" ON "brands" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_featured_idx" ON "categories" USING btree ("featured");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "import_batches_imported_at_idx" ON "import_batches" USING btree ("imported_at");--> statement-breakpoint
CREATE INDEX "order_line_items_product_id_idx" ON "order_line_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_ecotrack_reference_idx" ON "orders" USING btree ("ecotrack_reference");--> statement-breakpoint
CREATE INDEX "orders_ecotrack_tracking_idx" ON "orders" USING btree ("ecotrack_tracking_number");--> statement-breakpoint
CREATE INDEX "processed_orders_encaissed_at_idx" ON "processed_orders" USING btree ("encaissed_at");--> statement-breakpoint
CREATE INDEX "processed_orders_delivered_at_idx" ON "processed_orders" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "processed_orders_order_created_at_idx" ON "processed_orders" USING btree ("order_created_at");--> statement-breakpoint
CREATE INDEX "processed_orders_wilaya_idx" ON "processed_orders" USING btree ("wilaya");--> statement-breakpoint
CREATE INDEX "processed_orders_import_batch_id_idx" ON "processed_orders" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("featured");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");