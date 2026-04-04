import {
  bigserial,
  bigint,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from './namespaces';

export const processedOrders = adminSchema.table(
  "processed_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    tracking: text("tracking").notNull().unique(),
    customerName: text("customer_name").notNull().default(""),
    wilaya: text("wilaya").notNull().default(""),
    commune: text("commune").notNull().default(""),
    deliveryType: text("delivery_type").notNull().default(""),

    amountCollected: numeric("amount_collected", { precision: 12, scale: 2 })
      .notNull().default("0"),
    totalFees: numeric("total_fees", { precision: 12, scale: 2 })
      .notNull().default("0"),
    netRevenue: numeric("net_revenue", { precision: 12, scale: 2 })
      .notNull().default("0"),
    productCost: numeric("product_cost", { precision: 12, scale: 2 })
      .notNull().default("0"),
    profit: numeric("profit", { precision: 12, scale: 2 })
      .notNull().default("0"),

    feeLivraison: numeric("fee_livraison", { precision: 10, scale: 2 })
      .notNull().default("0"),
    feePoids: numeric("fee_poids", { precision: 10, scale: 2 })
      .notNull().default("0"),
    feeExtra: numeric("fee_extra", { precision: 10, scale: 2 })
      .notNull().default("0"),
    feeSms: numeric("fee_sms", { precision: 10, scale: 2 })
      .notNull().default("0"),
    feeStockage: numeric("fee_stockage", { precision: 10, scale: 2 })
      .notNull().default("0"),
    feeCommission: numeric("fee_commission", { precision: 10, scale: 2 })
      .notNull().default("0"),

    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    orderCreatedAt: timestamp("order_created_at", { withTimezone: true }),
    encaissedAt: timestamp("encaissed_at", { withTimezone: true }),

    importBatchId: text("import_batch_id").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow(),
  },
  (t) => [
    index("idx_po_encaissed").on(t.encaissedAt),
    index("idx_po_delivered").on(t.deliveredAt),
    index("idx_po_created").on(t.orderCreatedAt),
    index("idx_po_wilaya").on(t.wilaya),
    index("idx_po_batch").on(t.importBatchId),
    index("idx_po_stats_date").on(sql`coalesce(${t.encaissedAt}, ${t.deliveredAt}, ${t.orderCreatedAt})`),
    index("idx_po_wilaya_stats_date").on(t.wilaya, sql`coalesce(${t.encaissedAt}, ${t.deliveredAt}, ${t.orderCreatedAt})`),
    index("idx_po_delivery_stats_date").on(t.deliveryType, sql`coalesce(${t.encaissedAt}, ${t.deliveredAt}, ${t.orderCreatedAt})`),
  ]
);

export const processedOrderProducts = adminSchema.table(
  "processed_order_products",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    processedOrderId: bigint("processed_order_id", { mode: "number" })
      .notNull()
      .references(() => processedOrders.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    title: text("title"),
    price: numeric("price", { precision: 12, scale: 2 })
      .notNull().default("0"),
    cost: numeric("cost", { precision: 12, scale: 2 })
      .notNull().default("0"),
    sku: text("sku"),
    categoryId: text("category_id"),
    categoryName: text("category_name"),
    brandId: text("brand_id"),
    brandName: text("brand_name"),
  },
  (t) => [index("idx_pop_parent").on(t.processedOrderId)]
);
