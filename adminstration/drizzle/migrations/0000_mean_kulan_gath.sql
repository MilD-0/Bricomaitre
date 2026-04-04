CREATE TABLE "ad_costs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"platform" text DEFAULT 'facebook' NOT NULL,
	"campaign_name" text,
	"campaign_id" text,
	"spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"conversions" integer,
	"reach" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ad_costs_date_platform_campaign" UNIQUE("date","platform","campaign_name")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"name_ar" text,
	"image" text,
	"parent_id" bigint,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"file_name" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"matched_orders" integer DEFAULT 0 NOT NULL,
	"unmatched_references" text[] DEFAULT '{}' NOT NULL,
	"date_range_start" date,
	"date_range_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_en" text,
	"title_ar" text,
	"description" text,
	"description_en" text,
	"description_ar" text,
	"summary" text,
	"summary_ar" text,
	"summary2" text,
	"summary2_ar" text,
	"vid_link" text,
	"color" text,
	"price" numeric(12, 2) NOT NULL,
	"old_price" numeric(12, 2),
	"purchase_price" numeric(12, 2),
	"show_percentage" numeric(5, 2),
	"stock" integer,
	"sku" text,
	"by" text,
	"featured" boolean DEFAULT false NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"brand_id" bigint,
	"category_id" bigint,
	"images" text[] DEFAULT '{}' NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"features_ar" text[] DEFAULT '{}' NOT NULL,
	"spec_descs" text[] DEFAULT '{}' NOT NULL,
	"spec_descs_ar" text[] DEFAULT '{}' NOT NULL,
	"spec_icons" text[] DEFAULT '{}' NOT NULL,
	"spec_values" text[] DEFAULT '{}' NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"status" text,
	"changed_by" text,
	"changed_by_name" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"state" text,
	"city" text,
	"home_address" text,
	"email" text,
	"phone_number_1" text NOT NULL,
	"phone_number_2" text,
	"cart_products" text[] DEFAULT '{}' NOT NULL,
	"variant" text,
	"delivery" text,
	"del_pr" numeric(10, 2),
	"price" numeric(12, 2),
	"note" text,
	"confirmed" text,
	"confirmed_by" text,
	"confirmed_by_name" text,
	"confirmed_at" timestamp with time zone,
	"ecotrack_status" text,
	"ecotrack_status_last_update" timestamp with time zone,
	"ecotrack_status_data" jsonb,
	"ecotrack_reference" text,
	"ecotrack_tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_order_products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"processed_order_id" bigint NOT NULL,
	"product_id" text,
	"title" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sku" text,
	"category_id" text,
	"category_name" text,
	"brand_id" text,
	"brand_name" text
);
--> statement-breakpoint
CREATE TABLE "processed_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"tracking" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"wilaya" text DEFAULT '' NOT NULL,
	"commune" text DEFAULT '' NOT NULL,
	"delivery_type" text DEFAULT '' NOT NULL,
	"amount_collected" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"product_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"profit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fee_livraison" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_poids" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_extra" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_sms" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_stockage" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivered_at" timestamp with time zone,
	"order_created_at" timestamp with time zone,
	"encaissed_at" timestamp with time zone,
	"import_batch_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_orders_tracking_unique" UNIQUE("tracking")
);
--> statement-breakpoint
CREATE TABLE "migration_id_map" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"collection_name" text NOT NULL,
	"mongo_id" text NOT NULL,
	"new_id" bigint NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mig_collection_mongo" UNIQUE("collection_name","mongo_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_order_products" ADD CONSTRAINT "processed_order_products_processed_order_id_processed_orders_id_fk" FOREIGN KEY ("processed_order_id") REFERENCES "public"."processed_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ad_costs_date" ON "ad_costs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_brand" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_osh_order" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_orders_confirmed" ON "orders" USING btree ("confirmed");--> statement-breakpoint
CREATE INDEX "idx_orders_created" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pop_parent" ON "processed_order_products" USING btree ("processed_order_id");--> statement-breakpoint
CREATE INDEX "idx_po_encaissed" ON "processed_orders" USING btree ("encaissed_at");--> statement-breakpoint
CREATE INDEX "idx_po_delivered" ON "processed_orders" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "idx_po_created" ON "processed_orders" USING btree ("order_created_at");--> statement-breakpoint
CREATE INDEX "idx_po_wilaya" ON "processed_orders" USING btree ("wilaya");--> statement-breakpoint
CREATE INDEX "idx_po_batch" ON "processed_orders" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "idx_mig_lookup" ON "migration_id_map" USING btree ("collection_name","new_id");