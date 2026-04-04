CREATE TABLE "user_access_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"role_definition_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_access_grants_email_unique" ON "user_access_grants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_access_grants_role_definition_id_idx" ON "user_access_grants" USING btree ("role_definition_id");