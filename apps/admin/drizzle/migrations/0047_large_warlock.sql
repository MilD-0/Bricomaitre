CREATE TABLE "admin"."reporting_snapshot_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_import_batch_id" text,
	"pending_refresh" boolean DEFAULT false NOT NULL,
	"pending_trigger" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."reporting_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_key" text NOT NULL,
	"run_id" text NOT NULL,
	"trigger" text NOT NULL,
	"source_import_batch_id" text,
	"range" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"report_through_date" date,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_snapshot_runs_run_id_unique" ON "admin"."reporting_snapshot_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshot_runs_status" ON "admin"."reporting_snapshot_runs" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshot_runs_completed" ON "admin"."reporting_snapshot_runs" USING btree ("completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_snapshots_key_run_unique" ON "admin"."reporting_snapshots" USING btree ("snapshot_key","run_id");--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshots_key_generated" ON "admin"."reporting_snapshots" USING btree ("snapshot_key","generated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshots_stale" ON "admin"."reporting_snapshots" USING btree ("stale_at");