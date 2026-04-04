import {
  pgTable,
  bigserial,
  bigint,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orders = pgTable(
  "orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    state: integer("state"),
    city: text("city"),
    homeAddress: text("home_address"),
    email: text("email"),
    phoneNumber1: text("phone_number_1").notNull(),
    phoneNumber2: text("phone_number_2"),
    publicToken: text("public_token"),
    cartProducts: text("cart_products").array().notNull().default([]),
    journeyId: text("journey_id"),
    sessionId: text("session_id"),
    variant: text("variant"),
    delivery: integer("delivery").notNull().default(0),
    delPr: numeric("del_pr", { precision: 10, scale: 2 }),
    price: numeric("price", { precision: 12, scale: 2 }),
    note: text("note"),

    confirmed: integer("confirmed").notNull().default(0),
    noAnswerCount: integer("no_answer_count").notNull().default(0),
    confirmedBy: text("confirmed_by"),
    confirmedByName: text("confirmed_by_name"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    ecotrackStatus: text("ecotrack_status"),
    ecotrackStatusLastUpdate: timestamp("ecotrack_status_last_update", {
      withTimezone: true,
    }),
    ecotrackStatusData: jsonb("ecotrack_status_data"),
    ecotrackReference: text("ecotrack_reference"),
    ecotrackTrackingNumber: text("ecotrack_tracking_number"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_orders_confirmed").on(t.confirmed),
    index("idx_orders_created").on(t.createdAt),
    index("idx_orders_journey").on(t.journeyId),
    index("idx_orders_session").on(t.sessionId),
    index("idx_orders_archived_at").on(t.archivedAt),
    uniqueIndex("orders_public_token_unique").on(t.publicToken),
    index("idx_orders_active_created_at")
      .on(t.createdAt.desc())
      .where(sql`${t.archivedAt} is null`),
    index("idx_orders_active_confirmed_created_at")
      .on(t.confirmed, t.createdAt.desc())
      .where(sql`${t.archivedAt} is null`),
  ]
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: integer("status").notNull().default(0),
    noAnswerCount: integer("no_answer_count").notNull().default(0),
    changedBy: text("changed_by"),
    changedByName: text("changed_by_name"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_osh_order").on(t.orderId, t.changedAt)]
);
