import {
  pgTable,
  bigserial,
  bigint,
  text,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { brands } from './brands';
import { categories } from './categories';

export const products = pgTable(
  'products',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    titleAr: text('title_ar'),
    description: text('description'),
    descriptionAr: text('description_ar'),
    mongoId: text('mongo_id'),
    sku: text('sku'),
    barcode: text('barcode'),

    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    oldPrice: numeric('old_price', { precision: 12, scale: 2 }),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),

    active: boolean('active').notNull().default(true),
    inStock: boolean('in_stock').notNull().default(true),
    availabilityStatus: text('availability_status').notNull().default('in_stock'),

    unitsSold: bigint('units_sold', { mode: 'number' }).notNull().default(0),
    inventoryQuantity: bigint('inventory_quantity', { mode: 'number' }).notNull().default(0),
    viewCount: bigint('view_count', { mode: 'number' }).notNull().default(0),
    addToCartCount: bigint('add_to_cart_count', { mode: 'number' }).notNull().default(0),
    checkoutCount: bigint('checkout_count', { mode: 'number' }).notNull().default(0),
    purchaseCount: bigint('purchase_count', { mode: 'number' }).notNull().default(0),
    popularityScore: numeric('popularity_score', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    conversionRate: numeric('conversion_rate', { precision: 8, scale: 4 }).notNull().default('0'),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),

    brandId: bigint('brand_id', { mode: 'number' }).references(() => brands.id, {
      onDelete: 'set null',
    }),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, {
      onDelete: 'set null',
    }),

    images: text('images').array().notNull().default([]),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_products_category').on(t.categoryId),
    index('idx_products_brand').on(t.brandId),
    index('idx_products_mongo_id').on(t.mongoId),
    uniqueIndex('products_slug_unique').on(t.slug),
    uniqueIndex('products_sku_nonempty_unique')
      .on(sql`lower(btrim(${t.sku}))`)
      .where(sql`nullif(btrim(${t.sku}), '') is not null`),
    uniqueIndex('products_barcode_nonempty_unique')
      .on(sql`lower(btrim(${t.barcode}))`)
      .where(sql`nullif(btrim(${t.barcode}), '') is not null`),
    index('idx_products_archived_at').on(t.archivedAt),
    index('idx_products_updated_at').on(t.updatedAt.desc()),
    index('idx_products_brand_updated_at').on(t.brandId, t.updatedAt.desc()),
    index('idx_products_category_updated_at').on(t.categoryId, t.updatedAt.desc()),
    index('idx_products_popularity').on(t.popularityScore),
    index('idx_products_last_viewed_at').on(t.lastViewedAt.desc()),
    index('idx_products_title_trgm').using('gin', t.title.op('gin_trgm_ops')),
    index('idx_products_sku_trgm').using('gin', t.sku.op('gin_trgm_ops')),
    index('idx_products_barcode_trgm').using('gin', t.barcode.op('gin_trgm_ops')),
  ],
);
