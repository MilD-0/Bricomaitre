CREATE TYPE "public"."product_attribute_data_type" AS ENUM('text', 'number', 'boolean', 'enum', 'multi_enum');--> statement-breakpoint
CREATE TYPE "public"."product_evidence_type" AS ENUM('manufacturer_document', 'manufacturer_page', 'admin_note', 'sales_data', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_knowledge_review_status" AS ENUM('proposed', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."product_knowledge_source" AS ENUM('manufacturer', 'admin', 'algorithm', 'ai', 'customer_behavior');--> statement-breakpoint
CREATE TYPE "public"."product_project_suitability" AS ENUM('recommended', 'suitable', 'conditional', 'unsuitable');--> statement-breakpoint
CREATE TYPE "public"."product_relation_type" AS ENUM('compatible_with', 'requires', 'alternative_to', 'accessory_for', 'frequently_bought_with');--> statement-breakpoint
CREATE TABLE "product_attribute_definitions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"data_type" "product_attribute_data_type" NOT NULL,
	"unit" text,
	"allowed_values" jsonb,
	"category_id" bigint,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"definition_id" bigint NOT NULL,
	"value" jsonb NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"evidence_summary" text,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_attribute_values_confidence_check" CHECK ("product_attribute_values"."confidence" is null or ("product_attribute_values"."confidence" >= 0 and "product_attribute_values"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "product_project_uses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"project_type_id" bigint NOT NULL,
	"suitability" "product_project_suitability" DEFAULT 'suitable' NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"evidence_summary" text,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_project_uses_confidence_check" CHECK ("product_project_uses"."confidence" is null or ("product_project_uses"."confidence" >= 0 and "product_project_uses"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "product_relation_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"relation_id" bigint NOT NULL,
	"evidence_type" "product_evidence_type" NOT NULL,
	"source_url" text,
	"source_label" text,
	"excerpt" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_product_id" bigint NOT NULL,
	"target_product_id" bigint NOT NULL,
	"relation_type" "product_relation_type" NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_relations_distinct_products_check" CHECK ("product_relations"."source_product_id" <> "product_relations"."target_product_id"),
	CONSTRAINT "product_relations_confidence_check" CHECK ("product_relations"."confidence" is null or ("product_relations"."confidence" >= 0 and "product_relations"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "project_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"parent_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_attribute_definitions" ADD CONSTRAINT "product_attribute_definitions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_definition_id_product_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."product_attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_project_uses" ADD CONSTRAINT "product_project_uses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_project_uses" ADD CONSTRAINT "product_project_uses_project_type_id_project_types_id_fk" FOREIGN KEY ("project_type_id") REFERENCES "public"."project_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relation_evidence" ADD CONSTRAINT "product_relation_evidence_relation_id_product_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."product_relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_types" ADD CONSTRAINT "project_types_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."project_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_definitions_key_category_unique" ON "product_attribute_definitions" USING btree ("key",coalesce("category_id", 0));--> statement-breakpoint
CREATE INDEX "idx_product_attribute_definitions_category" ON "product_attribute_definitions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_definitions_active" ON "product_attribute_definitions" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_values_product_definition_unique" ON "product_attribute_values" USING btree ("product_id","definition_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_values_definition" ON "product_attribute_values" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_values_review" ON "product_attribute_values" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_project_uses_product_project_unique" ON "product_project_uses" USING btree ("product_id","project_type_id");--> statement-breakpoint
CREATE INDEX "idx_product_project_uses_project" ON "product_project_uses" USING btree ("project_type_id");--> statement-breakpoint
CREATE INDEX "idx_product_project_uses_review" ON "product_project_uses" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_product_relation_evidence_relation" ON "product_relation_evidence" USING btree ("relation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_relations_source_target_type_unique" ON "product_relations" USING btree ("source_product_id","target_product_id","relation_type");--> statement-breakpoint
CREATE INDEX "idx_product_relations_target" ON "product_relations" USING btree ("target_product_id");--> statement-breakpoint
CREATE INDEX "idx_product_relations_type_review" ON "product_relations" USING btree ("relation_type","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_types_slug_unique" ON "project_types" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_project_types_parent" ON "project_types" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_project_types_active" ON "project_types" USING btree ("active");