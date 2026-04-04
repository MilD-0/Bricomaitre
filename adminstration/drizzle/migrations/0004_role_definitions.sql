CREATE TYPE "role_permission" AS ENUM('products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'meta_ads_write', 'ops_view', 'settings_manage');
--> statement-breakpoint
CREATE TABLE "role_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_definition_permissions" (
	"role_id" integer NOT NULL,
	"permission" "role_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_definition_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
ALTER TABLE "role_definition_permissions" ADD CONSTRAINT "role_definition_permissions_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_name_unique" ON "role_definitions" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_slug_unique" ON "role_definitions" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "role_definition_permissions_role_id_idx" ON "role_definition_permissions" USING btree ("role_id");
