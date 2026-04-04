CREATE TABLE "bulletin_post_tags" (
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletin_post_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "bulletin_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulletin_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_definition_permissions" ALTER COLUMN "permission" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."role_permission";--> statement-breakpoint
CREATE TYPE "public"."role_permission" AS ENUM('products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'bulletin_moderate', 'ops_view', 'settings_manage');--> statement-breakpoint
ALTER TABLE "role_definition_permissions" ALTER COLUMN "permission" SET DATA TYPE "public"."role_permission" USING "permission"::"public"."role_permission";--> statement-breakpoint
ALTER TABLE "bulletin_post_tags" ADD CONSTRAINT "bulletin_post_tags_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_post_tags" ADD CONSTRAINT "bulletin_post_tags_tag_id_bulletin_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."bulletin_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_posts" ADD CONSTRAINT "bulletin_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulletin_post_tags_post_id_idx" ON "bulletin_post_tags" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bulletin_post_tags_tag_id_idx" ON "bulletin_post_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "bulletin_posts_author_id_idx" ON "bulletin_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bulletin_posts_pinned_idx" ON "bulletin_posts" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "bulletin_posts_updated_at_idx" ON "bulletin_posts" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_tags_name_unique" ON "bulletin_tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_tags_slug_unique" ON "bulletin_tags" USING btree ("slug");