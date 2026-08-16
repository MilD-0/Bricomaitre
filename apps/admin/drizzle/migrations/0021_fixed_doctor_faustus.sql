CREATE TABLE "ecotrack_communes" (
	"commune_id" integer PRIMARY KEY NOT NULL,
	"wilaya_id" integer NOT NULL,
	"name" text NOT NULL,
	"postal_code" text,
	"has_stop_desk" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecotrack_service_fees" (
	"service_type" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"home_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stop_desk_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecotrack_service_fees_service_type_wilaya_id_pk" PRIMARY KEY("service_type","wilaya_id")
);
--> statement-breakpoint
CREATE TABLE "ecotrack_sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"wilaya_count" integer DEFAULT 0 NOT NULL,
	"commune_count" integer DEFAULT 0 NOT NULL,
	"service_fee_count" integer DEFAULT 0 NOT NULL,
	"weight_fee_count" integer DEFAULT 0 NOT NULL,
	"rate_limit_snapshot" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecotrack_weight_fees" (
	"service_type" text PRIMARY KEY NOT NULL,
	"home_surcharge" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stop_desk_surcharge" numeric(10, 2) DEFAULT '0' NOT NULL,
	"per_additional_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"starts_at_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecotrack_wilayas" (
	"wilaya_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecotrack_communes" ADD CONSTRAINT "ecotrack_communes_wilaya_id_ecotrack_wilayas_wilaya_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."ecotrack_wilayas"("wilaya_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecotrack_service_fees" ADD CONSTRAINT "ecotrack_service_fees_wilaya_id_ecotrack_wilayas_wilaya_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."ecotrack_wilayas"("wilaya_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ecotrack_communes_wilaya" ON "ecotrack_communes" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_communes_name" ON "ecotrack_communes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_service_fees_wilaya" ON "ecotrack_service_fees" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_sync_runs_started_at" ON "ecotrack_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_sync_runs_status" ON "ecotrack_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_wilayas_name" ON "ecotrack_wilayas" USING btree ("name");