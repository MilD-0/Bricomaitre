import {
  bigserial,
  date,
  text,
  numeric,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { adminSchema } from './namespaces';

export const adSpendImportBatches = adminSchema.table(
  "ad_spend_import_batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    batchId: text("batch_id").notNull().unique(),
    fileName: text("file_name").notNull(),
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    updatedRows: integer("updated_rows").notNull().default(0),
    uploadedByEmail: text("uploaded_by_email"),
    uploadedByName: text("uploaded_by_name"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export const adCosts = adminSchema.table(
  "ad_costs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    date: date("date").notNull(),
    platform: text("platform").notNull().default("facebook"),
    campaignName: text("campaign_name"),
    campaignId: text("campaign_id"),
    spend: numeric("spend", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    conversions: integer("conversions"),
    reach: integer("reach"),
    notes: text("notes"),
    importBatchId: text("import_batch_id").references(() => adSpendImportBatches.batchId, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_ad_costs_date_platform_campaign").on(
      t.date,
      t.platform,
      t.campaignName
    ),
    index("idx_ad_costs_date").on(t.date),
  ]
);
