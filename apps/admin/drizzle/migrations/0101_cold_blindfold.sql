CREATE TABLE "admin"."ecotrack_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"tracking_number" text,
	"order_updated_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"error" text,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecotrack_mutations_state_check" CHECK ("admin"."ecotrack_mutations"."state" in ('pending', 'succeeded', 'uncertain', 'applied', 'rejected')),
	CONSTRAINT "ecotrack_mutations_kind_check" CHECK ("admin"."ecotrack_mutations"."kind" in ('post', 'update', 'recreate', 'delete', 'dispatch', 'maj', 'return')),
	CONSTRAINT "ecotrack_mutations_provider_check" CHECK ("admin"."ecotrack_mutations"."provider" in ('delivro', 'emir'))
);
--> statement-breakpoint
DROP INDEX "admin"."ecotrack_order_maj_entries_unique";--> statement-breakpoint
DROP INDEX "admin"."ecotrack_order_tracking_events_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_mutations_unresolved_order" ON "admin"."ecotrack_mutations" USING btree ("order_id") WHERE "admin"."ecotrack_mutations"."state" in ('pending', 'succeeded', 'uncertain');--> statement-breakpoint
CREATE INDEX "idx_ecotrack_mutations_order_created" ON "admin"."ecotrack_mutations" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_maj_entries_unique" ON "admin"."ecotrack_order_maj_entries" USING btree ("order_id","tracking_number","remarque","remote_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_tracking_events_unique" ON "admin"."ecotrack_order_tracking_events" USING btree ("order_id","tracking_number","event_date","event_time","status",coalesce("scan_location", ''));