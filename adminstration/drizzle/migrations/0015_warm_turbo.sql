CREATE TABLE "bulletin_post_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulletin_post_attachments" ADD CONSTRAINT "bulletin_post_attachments_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulletin_post_attachments_post_id_idx" ON "bulletin_post_attachments" USING btree ("post_id");