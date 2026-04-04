ALTER TABLE "users" ADD COLUMN "role_definition_id" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "users_role_definition_id_idx" ON "users" USING btree ("role_definition_id");
