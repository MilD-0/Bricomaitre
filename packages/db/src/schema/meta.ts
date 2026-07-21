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

import { analyticsEvents } from "./analytics";
import { orderStatusHistory, orders } from "./orders";
import { products } from "./products";

export const orderLineItems = pgTable(
  "order_line_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" }).references(
      () => products.id,
      { onDelete: "set null" },
    ),
    contentId: text("content_id").notNull(),
    rawValue: text("raw_value").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    originalUnitPrice: numeric("original_unit_price", { precision: 12, scale: 2 }).notNull(),
    effectiveUnitPrice: numeric("effective_unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    thumbnailUrl: text("thumbnail_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_line_items_order_content_unique").on(t.orderId, t.contentId),
    index("idx_order_line_items_order").on(t.orderId),
    index("idx_order_line_items_product").on(t.productId),
  ],
);

export const orderMetaAttribution = pgTable(
  "order_meta_attribution",
  {
    orderId: bigint("order_id", { mode: "number" })
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    semanticsVersion: text("semantics_version").notNull(),
    leadEventId: text("lead_event_id").notNull(),
    eventSourceUrl: text("event_source_url").notNull(),
    fbc: text("fbc"),
    fbp: text("fbp"),
    externalIdSource: text("external_id_source"),
    clientIpAddress: text("client_ip_address"),
    clientUserAgent: text("client_user_agent"),
    leadOutboxId: bigint("lead_outbox_id", { mode: "number" }),
    purchaseOutboxId: bigint("purchase_outbox_id", { mode: "number" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_meta_attribution_lead_event_unique").on(t.leadEventId),
    index("idx_order_meta_attribution_semantics").on(t.semanticsVersion, t.createdAt.desc()),
    index("idx_order_meta_attribution_expires").on(t.expiresAt),
  ],
);

export const metaEventOutbox = pgTable(
  "meta_event_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    source: text("source").notNull(),
    orderId: bigint("order_id", { mode: "number" }).references(
      () => orders.id,
      { onDelete: "set null" },
    ),
    orderStatusHistoryId: bigint("order_status_history_id", { mode: "number" }).references(
      () => orderStatusHistory.id,
      { onDelete: "set null" },
    ),
    analyticsEventId: bigint("analytics_event_id", { mode: "number" }).references(
      () => analyticsEvents.id,
      { onDelete: "set null" },
    ),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    eventSourceUrl: text("event_source_url").notNull(),
    userData: jsonb("user_data").notNull().default({}),
    customData: jsonb("custom_data").notNull().default({}),
    matchKeySummary: jsonb("match_key_summary").notNull().default([]),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processingLeaseExpiresAt: timestamp("processing_lease_expires_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastHttpStatus: integer("last_http_status"),
    metaErrorCode: integer("meta_error_code"),
    metaErrorSubcode: integer("meta_error_subcode"),
    metaErrorMessage: text("meta_error_message"),
    fbtraceId: text("fbtrace_id"),
    eventsReceived: integer("events_received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_event_outbox_name_id_unique").on(t.eventName, t.eventId),
    index("idx_meta_event_outbox_delivery").on(t.status, t.nextAttemptAt),
    index("idx_meta_event_outbox_order").on(t.orderId, t.createdAt.desc()),
    index("idx_meta_event_outbox_event").on(t.eventName, t.createdAt.desc()),
    index("idx_meta_event_outbox_event_time").on(t.eventTime.desc()),
    index("idx_meta_event_outbox_lease").on(t.processingLeaseExpiresAt),
  ],
);

export const metaEventDailyRollups = pgTable(
  "meta_event_daily_rollups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    eventName: text("event_name").notNull(),
    total: integer("total").notNull().default(0),
    pixelFired: integer("pixel_fired").notNull().default(0),
    capiSent: integer("capi_sent").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_event_daily_rollups_day_event_unique").on(t.day, t.eventName),
    index("idx_meta_event_daily_rollups_event_day").on(t.eventName, t.day),
  ],
);

export const metaWorkerHeartbeat = pgTable("meta_worker_heartbeat", {
  workerKey: text("worker_key").primaryKey(),
  release: text("release"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  lastSuccessfulDrainAt: timestamp("last_successful_drain_at", { withTimezone: true }),
  lastReconciliationAt: timestamp("last_reconciliation_at", { withTimezone: true }),
  lastReconciliationResult: jsonb("last_reconciliation_result").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderMarketingAttribution = pgTable(
  "order_marketing_attribution",
  {
    orderId: bigint("order_id", { mode: "number" })
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    semanticsVersion: text("semantics_version").notNull(),
    eventId: text("event_id").notNull(),
    eventSourceUrl: text("event_source_url").notNull(),
    googleClientId: text("google_client_id"),
    googleSessionId: text("google_session_id"),
    gclid: text("gclid"),
    gbraid: text("gbraid"),
    wbraid: text("wbraid"),
    tiktokClickId: text("tiktok_click_id"),
    tiktokCookieId: text("tiktok_cookie_id"),
    clientIpAddress: text("client_ip_address"),
    clientUserAgent: text("client_user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_marketing_attribution_event_unique").on(t.eventId),
    index("idx_order_marketing_attribution_semantics").on(t.semanticsVersion, t.createdAt.desc()),
    index("idx_order_marketing_attribution_expires").on(t.expiresAt),
  ],
);

export const marketingEventOutbox = pgTable(
  "marketing_event_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    destination: text("destination").notNull(),
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    source: text("source").notNull(),
    orderId: bigint("order_id", { mode: "number" }).references(
      () => orders.id,
      { onDelete: "set null" },
    ),
    orderStatusHistoryId: bigint("order_status_history_id", { mode: "number" }).references(
      () => orderStatusHistory.id,
      { onDelete: "set null" },
    ),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processingLeaseExpiresAt: timestamp("processing_lease_expires_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastHttpStatus: integer("last_http_status"),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    responseSummary: jsonb("response_summary").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("marketing_event_outbox_destination_name_id_unique").on(t.destination, t.eventName, t.eventId),
    index("idx_marketing_event_outbox_delivery").on(t.destination, t.status, t.nextAttemptAt),
    index("idx_marketing_event_outbox_order").on(t.orderId, t.createdAt.desc()),
    index("idx_marketing_event_outbox_lease").on(t.processingLeaseExpiresAt),
  ],
);
