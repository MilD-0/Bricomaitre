import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { products } from './products';

export const bundlePricingModeEnum = pgEnum('bundle_pricing_mode', ['fixed', 'component_sum']);

export const bundleListings = pgTable(
  'bundle_listings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    pricingMode: bundlePricingModeEnum('pricing_mode').notNull().default('fixed'),
    active: boolean('active').notNull().default(false),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bundle_listings_product_unique').on(t.productId),
    index('idx_bundle_listings_active').on(t.active),
  ],
);

export const bundleComponents = pgTable(
  'bundle_components',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    bundleId: bigint('bundle_id', { mode: 'number' })
      .notNull()
      .references(() => bundleListings.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitPurchasePriceSnapshot: numeric('unit_purchase_price_snapshot', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bundle_components_bundle_product_unique').on(t.bundleId, t.productId),
    index('idx_bundle_components_product').on(t.productId),
    check('bundle_components_quantity_check', sql`${t.quantity} > 0`),
  ],
);

export const aiPricingPolicies = pgTable(
  'ai_pricing_policies',
  {
    id: integer('id').primaryKey().default(1),
    defaultMinimumGrossMargin: numeric('default_minimum_gross_margin', { precision: 5, scale: 4 })
      .notNull()
      .default('0.1500'),
    allowRequestOverride: boolean('allow_request_override').notNull().default(true),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ai_pricing_policies_margin_check',
      sql`${t.defaultMinimumGrossMargin} >= 0 and ${t.defaultMinimumGrossMargin} < 1`,
    ),
  ],
);
