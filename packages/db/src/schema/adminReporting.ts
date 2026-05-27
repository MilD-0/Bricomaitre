import {
  bigserial,
  boolean,
  date,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { adminSchema } from "./namespaces";

export const adminReportingSnapshotRuns = adminSchema.table(
  "reporting_snapshot_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: text("run_id").notNull(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull().default("queued"),
    sourceImportBatchId: text("source_import_batch_id"),
    pendingRefresh: boolean("pending_refresh").notNull().default(false),
    pendingTrigger: text("pending_trigger"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reporting_snapshot_runs_run_id_unique").on(t.runId),
    index("idx_reporting_snapshot_runs_status").on(t.status, t.createdAt.desc()),
    index("idx_reporting_snapshot_runs_completed").on(t.completedAt.desc()),
  ],
);

export const adminReportingSnapshots = adminSchema.table(
  "reporting_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    snapshotKey: text("snapshot_key").notNull(),
    runId: text("run_id").notNull(),
    trigger: text("trigger").notNull(),
    sourceImportBatchId: text("source_import_batch_id"),
    range: text("range").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    reportThroughDate: date("report_through_date"),
    payload: jsonb("payload").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    staleAt: timestamp("stale_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reporting_snapshots_key_run_unique").on(t.snapshotKey, t.runId),
    index("idx_reporting_snapshots_key_generated").on(t.snapshotKey, t.generatedAt.desc()),
    index("idx_reporting_snapshots_stale").on(t.staleAt),
  ],
);
