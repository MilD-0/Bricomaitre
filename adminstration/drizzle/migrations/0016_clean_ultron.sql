CREATE TABLE "bulletin_post_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulletin_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulletin_reply_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reply_id" integer NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulletin_post_reactions" ADD CONSTRAINT "bulletin_post_reactions_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_post_reactions" ADD CONSTRAINT "bulletin_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_reply_reactions" ADD CONSTRAINT "bulletin_reply_reactions_reply_id_bulletin_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."bulletin_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_reply_reactions" ADD CONSTRAINT "bulletin_reply_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulletin_post_reactions_post_id_idx" ON "bulletin_post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_post_reactions_unique" ON "bulletin_post_reactions" USING btree ("post_id","user_email","emoji");--> statement-breakpoint
CREATE INDEX "bulletin_replies_post_id_idx" ON "bulletin_replies" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bulletin_replies_author_id_idx" ON "bulletin_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bulletin_replies_created_at_idx" ON "bulletin_replies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bulletin_reply_reactions_reply_id_idx" ON "bulletin_reply_reactions" USING btree ("reply_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_reply_reactions_unique" ON "bulletin_reply_reactions" USING btree ("reply_id","user_email","emoji");