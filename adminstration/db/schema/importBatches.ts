import {
  bigserial,
  text,
  integer,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { adminSchema } from './namespaces';

export type UnmatchedImportRow = {
  reference: string;
  tracking: string;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  amountCollected: number;
  products: string;
  note: string;
};

export const importBatches = adminSchema.table("import_batches", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  batchId: text("batch_id").notNull().unique(),
  fileName: text("file_name").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  totalRows: integer("total_rows").notNull().default(0),
  matchedOrders: integer("matched_orders").notNull().default(0),
  unmatchedReferences: text("unmatched_references").array().notNull()
    .default([]),
  unmatchedDetails: jsonb("unmatched_details").$type<UnmatchedImportRow[]>().notNull().default([]),
  dateRangeStart: date("date_range_start"),
  dateRangeEnd: date("date_range_end"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
