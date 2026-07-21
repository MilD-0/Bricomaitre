import {
  bigint,
  bigserial,
  date,
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
    visitId: text("visit_id"),
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
    index("idx_analytics_events_visit").on(t.visitId, t.occurredAt.desc()),
    index("idx_analytics_events_journey").on(t.journeyId, t.occurredAt.desc()),
    index("idx_analytics_events_session").on(t.sessionId, t.occurredAt.desc()),
    index("idx_analytics_events_product").on(t.productId, t.occurredAt.desc()),
    index("idx_analytics_events_order").on(t.orderId, t.occurredAt.desc()),
  ],
);

export const analyticsPaidClickVisits = pgTable(
  "analytics_paid_click_visits",
  {
    visitId: text("visit_id").primaryKey(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    landingUrl: text("landing_url").notNull(),
    landingPath: text("landing_path").notNull(),
    landingQuery: jsonb("landing_query").notNull().default({}),
    landingHost: text("landing_host"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    storefrontVariant: text("storefront_variant"),
    requestedVariant: text("requested_variant"),
    experimentMode: text("experiment_mode"),
    experimentSource: text("experiment_source"),
    fbclidRaw: text("fbclid_raw"),
    fbc: text("fbc"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    paidSource: text("paid_source").notNull(),
    journeyId: text("journey_id"),
    sessionId: text("session_id"),
    orderId: bigint("order_id", { mode: "number" }).references(() => orders.id, { onDelete: "set null" }),
    entryEventId: text("entry_event_id"),
    lastEventName: text("last_event_name"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    eventCount: integer("event_count").notNull().default(0),
    purchaseCount: integer("purchase_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_analytics_paid_click_first_seen").on(t.firstSeenAt.desc(), t.visitId.desc()),
    index("idx_analytics_paid_click_variant_first_seen").on(t.storefrontVariant, t.firstSeenAt.desc()),
    index("idx_analytics_paid_click_source_first_seen").on(t.paidSource, t.firstSeenAt.desc()),
    index("idx_analytics_paid_click_journey").on(t.journeyId),
    index("idx_analytics_paid_click_session").on(t.sessionId),
    index("idx_analytics_paid_click_order").on(t.orderId),
    index("idx_analytics_paid_click_expires").on(t.expiresAt),
  ],
);

export const analyticsDailyRollups = pgTable(
  "analytics_daily_rollups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    dimension: text("dimension").notNull(),
    dimensionKey: text("dimension_key").notNull().default(""),
    sessions: integer("sessions").notNull().default(0),
    journeys: integer("journeys").notNull().default(0),
    pageViews: integer("page_views").notNull().default(0),
    productViews: integer("product_views").notNull().default(0),
    addToCarts: integer("add_to_carts").notNull().default(0),
    checkoutStarts: integer("checkout_starts").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    searches: integer("searches").notNull().default(0),
    zeroResultSearches: integer("zero_result_searches").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_daily_rollups_day_dimension_key_unique").on(t.day, t.dimension, t.dimensionKey),
    index("idx_analytics_daily_rollups_dimension_day").on(t.dimension, t.day),
  ],
);

// Narrow membership rows preserve exact distinct counts across day boundaries.
// Summing daily COUNT(DISTINCT ...) values would over-count returning sessions
// and journeys, especially for journeys that naturally span several days.
export const analyticsDistinctDailyMembers = pgTable(
  "analytics_distinct_daily_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    metric: text("metric").notNull(),
    dimensionKey: text("dimension_key").notNull().default(""),
    memberId: text("member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_distinct_members_day_metric_key_member_unique").on(
      t.day, t.metric, t.dimensionKey, t.memberId,
    ),
    index("idx_analytics_distinct_members_metric_day_key").on(t.metric, t.day, t.dimensionKey),
  ],
);

export const analyticsPaidClickDailyRollups = pgTable(
  "analytics_paid_click_daily_rollups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    variant: text("variant").notNull(),
    paidSource: text("paid_source").notNull(),
    hasOrder: integer("has_order").notNull().default(0),
    landingPath: text("landing_path").notNull(),
    visits: integer("visits").notNull().default(0),
    landedOnly: integer("landed_only").notNull().default(0),
    viewedProduct: integer("viewed_product").notNull().default(0),
    addedToCart: integer("added_to_cart").notNull().default(0),
    beganCheckout: integer("began_checkout").notNull().default(0),
    createdOrder: integer("created_order").notNull().default(0),
    purchased: integer("purchased").notNull().default(0),
    errored: integer("errored").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_paid_click_rollups_dimensions_unique").on(
      t.day, t.variant, t.paidSource, t.hasOrder, t.landingPath,
    ),
    index("idx_analytics_paid_click_rollups_day").on(t.day),
  ],
);
