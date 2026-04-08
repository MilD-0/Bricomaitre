import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { adminSchema } from './namespaces';

export const actionLogs = adminSchema.table(
  "action_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    resource: text("resource").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    entityLabel: text("entity_label").notNull(),
    operation: text("operation").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    isReversible: boolean("is_reversible").notNull().default(true),
    isUndone: boolean("is_undone").notNull().default(false),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneBy: text("undone_by"),
    redoneAt: timestamp("redone_at", { withTimezone: true }),
    redoneBy: text("redone_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_action_logs_created_at").on(t.createdAt),
    index("idx_action_logs_entity").on(t.entityType, t.entityId),
    index("idx_action_logs_resource").on(t.resource, t.createdAt),
  ]
);
