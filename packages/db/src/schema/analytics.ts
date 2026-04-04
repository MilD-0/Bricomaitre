import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { brands } from "./brands";
import { categories } from "./categories";
import { orders } from "./orders";
import { products } from "./products";

export const analyticsJourneys = pgTable(
  "analytics_journeys",
  {
    id: text("id").primaryKey(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    firstPath: text("first_path"),
    lastPath: text("last_path"),
    locale: text("locale"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    orderCount: integer("order_count").notNull().default(0),
    purchaseCount: integer("purchase_count").notNull().default(0),
    firstOrderId: bigint("first_order_id", { mode: "number" }).references(() => orders.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_analytics_journeys_first_seen").on(t.firstSeenAt.desc()),
    index("idx_analytics_journeys_last_seen").on(t.lastSeenAt.desc()),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull(),
    journeyId: text("journey_id").notNull().references(() => analyticsJourneys.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    eventName: text("event_name").notNull(),
    gaEventName: text("ga_event_name"),
    pagePath: text("page_path"),
    pageType: text("page_type"),
    locale: text("locale"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    productId: bigint("product_id", { mode: "number" }).references(() => products.id, { onDelete: "set null" }),
    productSlug: text("product_slug"),
    categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id, { onDelete: "set null" }),
    categorySlug: text("category_slug"),
    brandId: bigint("brand_id", { mode: "number" }).references(() => brands.id, { onDelete: "set null" }),
    brandSlug: text("brand_slug"),
    orderId: bigint("order_id", { mode: "number" }).references(() => orders.id, { onDelete: "set null" }),
    searchTerm: text("search_term"),
    quantity: integer("quantity"),
    value: numeric("value", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("DZD"),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_events_event_id_unique").on(t.eventId),
    index("idx_analytics_events_occurred_at").on(t.occurredAt.desc()),
    index("idx_analytics_events_event_name").on(t.eventName, t.occurredAt.desc()),
    index("idx_analytics_events_journey").on(t.journeyId, t.occurredAt.desc()),
    index("idx_analytics_events_session").on(t.sessionId, t.occurredAt.desc()),
    index("idx_analytics_events_product").on(t.productId, t.occurredAt.desc()),
    index("idx_analytics_events_order").on(t.orderId, t.occurredAt.desc()),
  ],
);
