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
