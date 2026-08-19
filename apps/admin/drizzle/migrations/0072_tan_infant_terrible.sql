CREATE TABLE "product_slug_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_announcements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"message" text NOT NULL,
	"link_label" text,
	"link_url" text,
	"active" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_content_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"meta_description" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_slug_history_slug_unique" ON "product_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_product_slug_history_product" ON "product_slug_history" USING btree ("product_id","replaced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_announcements_locale_unique" ON "storefront_announcements" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "idx_storefront_announcements_schedule" ON "storefront_announcements" USING btree ("locale","active","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_content_pages_locale_slug_unique" ON "storefront_content_pages" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "idx_storefront_content_pages_active" ON "storefront_content_pages" USING btree ("locale","active");