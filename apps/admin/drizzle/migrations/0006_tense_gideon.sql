CREATE TYPE "public"."user_role" AS ENUM('viewer', 'employee', 'admin', 'developer');--> statement-breakpoint
CREATE TYPE "public"."role_permission" AS ENUM('products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'meta_ads_write', 'ops_view', 'settings_manage');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"role_definition_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
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
ALTER TABLE "products" ALTER COLUMN "units_sold" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "in_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "requires_shipping" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_digital" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "dimension_unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_class" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "availability_status" text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "meta_keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definition_permissions" ADD CONSTRAINT "role_definition_permissions_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_definition_id_idx" ON "users" USING btree ("role_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_token_unique" ON "verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "role_definition_permissions_role_id_idx" ON "role_definition_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_name_unique" ON "role_definitions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_slug_unique" ON "role_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_products_slug" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_products_sku" ON "products" USING btree ("sku");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "featured";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "features";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "features_ar";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_descs";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_descs_ar";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_icons";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "spec_values";