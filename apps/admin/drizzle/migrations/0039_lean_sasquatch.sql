CREATE TABLE "admin"."ecotrack_order_maj_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"remarque" text NOT NULL,
	"station" text,
	"livreur" text,
	"remote_created_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"reference" text NOT NULL,
	"tracking_number" text NOT NULL,
	"current_status" text NOT NULL,
	"driver_phone" text,
	"estimated_fee" numeric(12, 2),
	"desk_phone" text,
	"desk_commune" text,
	"desk_map_link" text,
	"desk_address" text,
	"raw_status_payload" jsonb,
	"raw_create_payload" jsonb,
	"raw_last_tracking_payload" jsonb,
	"raw_last_maj_payload" jsonb,
	"last_status_synced_at" timestamp with time zone,
	"last_tracking_synced_at" timestamp with time zone,
	"last_maj_synced_at" timestamp with time zone,
	"last_action_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_tracking_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"event_date" date NOT NULL,
	"event_time" text NOT NULL,
	"status" text NOT NULL,
	"scan_location" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "featured_product_groups" ADD COLUMN IF NOT EXISTS "cta_ar" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "mongo_id" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "mongo_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "mongo_id" text;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_maj_entries" ADD CONSTRAINT "ecotrack_order_maj_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD CONSTRAINT "ecotrack_order_states_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_tracking_events" ADD CONSTRAINT "ecotrack_order_tracking_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_maj_entries_unique" ON "admin"."ecotrack_order_maj_entries" USING btree ("order_id","remarque","remote_created_at");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_maj_entries_order_created" ON "admin"."ecotrack_order_maj_entries" USING btree ("order_id","remote_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_maj_entries_tracking_created" ON "admin"."ecotrack_order_maj_entries" USING btree ("tracking_number","remote_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_states_order_id_unique" ON "admin"."ecotrack_order_states" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_states_tracking_unique" ON "admin"."ecotrack_order_states" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_current_status" ON "admin"."ecotrack_order_states" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_deleted_status_updated" ON "admin"."ecotrack_order_states" USING btree ("deleted_at","current_status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_tracking_events_unique" ON "admin"."ecotrack_order_tracking_events" USING btree ("order_id","event_date","event_time","status",coalesce("scan_location", ''));--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_order_date_time" ON "admin"."ecotrack_order_tracking_events" USING btree ("order_id","event_date" DESC NULLS LAST,"event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_tracking_date_time" ON "admin"."ecotrack_order_tracking_events" USING btree ("tracking_number","event_date" DESC NULLS LAST,"event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_status" ON "admin"."ecotrack_order_tracking_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brands_mongo_id" ON "brands" USING btree ("mongo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_categories_mongo_id" ON "categories" USING btree ("mongo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_mongo_id" ON "orders" USING btree ("mongo_id");
