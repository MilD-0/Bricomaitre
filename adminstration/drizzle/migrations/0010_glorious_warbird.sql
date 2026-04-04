CREATE TABLE "asset_banners" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"image_url" text NOT NULL,
	"product_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_brands" (
	"group_id" bigint NOT NULL,
	"brand_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_brands_group_id_brand_id_pk" PRIMARY KEY("group_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_categories" (
	"group_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_categories_group_id_category_id_pk" PRIMARY KEY("group_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_products" (
	"group_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_products_group_id_product_id_pk" PRIMARY KEY("group_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"title_ar" text NOT NULL,
	"title_fr" text NOT NULL,
	"description_ar" text NOT NULL,
	"description_fr" text NOT NULL,
	"characteristics_ar" text[] DEFAULT '{}' NOT NULL,
	"characteristics_fr" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_banners" ADD CONSTRAINT "asset_banners_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_brands" ADD CONSTRAINT "featured_product_group_brands_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_brands" ADD CONSTRAINT "featured_product_group_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_categories" ADD CONSTRAINT "featured_product_group_categories_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_categories" ADD CONSTRAINT "featured_product_group_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_products" ADD CONSTRAINT "featured_product_group_products_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_products" ADD CONSTRAINT "featured_product_group_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_cards" ADD CONSTRAINT "product_cards_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_asset_banners_product" ON "asset_banners" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_featured_group_brands_brand" ON "featured_product_group_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_featured_group_categories_category" ON "featured_product_group_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_featured_group_products_product" ON "featured_product_group_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_cards_product" ON "product_cards" USING btree ("product_id");