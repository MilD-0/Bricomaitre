import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const brands = pgTable(
  "brands",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    mongoId: text("mongo_id"),
    image: text("image"),
    isActive: boolean("is_active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    updatedBy: text("updated_by"),
    updatedByName: text("updated_by_name"),
    viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
    addToCartCount: bigint("add_to_cart_count", { mode: "number" }).notNull().default(0),
    checkoutCount: bigint("checkout_count", { mode: "number" }).notNull().default(0),
    purchaseCount: bigint("purchase_count", { mode: "number" }).notNull().default(0),
    popularityScore: numeric("popularity_score", { precision: 14, scale: 2 }).notNull().default("0"),
    conversionRate: numeric("conversion_rate", { precision: 8, scale: 4 }).notNull().default("0"),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("brands_slug_unique").on(t.slug),
    index("idx_brands_mongo_id").on(t.mongoId),
    index("idx_brands_popularity").on(t.popularityScore),
    index("idx_brands_last_viewed_at").on(t.lastViewedAt.desc()),
  ],
);
