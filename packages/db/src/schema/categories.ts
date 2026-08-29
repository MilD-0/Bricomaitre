import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const categories = pgTable(
  'categories',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    mongoId: text('mongo_id'),
    nameEn: text('name_en'),
    nameAr: text('name_ar'),
    image: text('image'),
    isActive: boolean('is_active').notNull().default(true),
    parentId: bigint('parent_id', { mode: 'number' }).references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),
    properties: jsonb('properties').notNull().default([]),
    featured: boolean('featured').notNull().default(false),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    updatedBy: text('updated_by'),
    updatedByName: text('updated_by_name'),
    viewCount: bigint('view_count', { mode: 'number' }).notNull().default(0),
    addToCartCount: bigint('add_to_cart_count', { mode: 'number' }).notNull().default(0),
    checkoutCount: bigint('checkout_count', { mode: 'number' }).notNull().default(0),
    purchaseCount: bigint('purchase_count', { mode: 'number' }).notNull().default(0),
    popularityScore: numeric('popularity_score', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    conversionRate: numeric('conversion_rate', { precision: 8, scale: 4 }).notNull().default('0'),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_categories_parent').on(t.parentId),
    index('idx_categories_mongo_id').on(t.mongoId),
    uniqueIndex('categories_slug_unique').on(t.slug),
    index('idx_categories_popularity').on(t.popularityScore),
    index('idx_categories_last_viewed_at').on(t.lastViewedAt.desc()),
    check(
      'categories_not_self_parent_check',
      sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`,
    ),
    check(
      'categories_engagement_counters_nonnegative_check',
      sql`${t.viewCount} >= 0 and ${t.addToCartCount} >= 0 and ${t.checkoutCount} >= 0 and ${t.purchaseCount} >= 0`,
    ),
    check('categories_popularity_score_nonnegative_check', sql`${t.popularityScore} >= 0`),
    check('categories_conversion_rate_nonnegative_check', sql`${t.conversionRate} >= 0`),
  ],
);
