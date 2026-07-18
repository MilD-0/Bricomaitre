CREATE TYPE "public"."landing_page_locale" AS ENUM('fr', 'ar');--> statement-breakpoint
CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "landing_page_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"landing_page_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"locale" "landing_page_locale" NOT NULL,
	"slug" text NOT NULL,
	"status" "landing_page_status" DEFAULT 'draft' NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"published_revision" integer,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "landing_page_revisions" ADD CONSTRAINT "landing_page_revisions_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_landing_page_revisions_page_revision" ON "landing_page_revisions" USING btree ("landing_page_id","revision");--> statement-breakpoint
CREATE INDEX "idx_landing_page_revisions_page_created" ON "landing_page_revisions" USING btree ("landing_page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_landing_pages_locale_slug" ON "landing_pages" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_product" ON "landing_pages" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_publication" ON "landing_pages" USING btree ("locale","status","updated_at");