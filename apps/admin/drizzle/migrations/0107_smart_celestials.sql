CREATE TABLE "admin"."off_pipeline_sales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"reference" text,
	"description" text NOT NULL,
	"recognized_on" date NOT NULL,
	"amount_collected" numeric(18, 2) NOT NULL,
	"fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"product_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "off_pipeline_sales_amount_nonnegative_check" CHECK ("admin"."off_pipeline_sales"."amount_collected" >= 0),
	CONSTRAINT "off_pipeline_sales_fees_nonnegative_check" CHECK ("admin"."off_pipeline_sales"."fees" >= 0),
	CONSTRAINT "off_pipeline_sales_product_cost_nonnegative_check" CHECK ("admin"."off_pipeline_sales"."product_cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idx_off_pipeline_sales_recognized_on" ON "admin"."off_pipeline_sales" USING btree ("recognized_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_off_pipeline_sales_reference" ON "admin"."off_pipeline_sales" USING btree ("reference");