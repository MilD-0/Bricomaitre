import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { brands } from './brands';
import { categories } from './categories';
import { products } from './products';

export const assetBanners = pgTable(
  'asset_banners',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    imageUrl: text('image_url').notNull(),
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_asset_banners_product').on(t.productId), index('idx_asset_banners_sort_order').on(t.sortOrder)],
);

export const featuredProductGroups = pgTable('featured_product_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  cta: text('cta'),
  ctaAr: text('cta_ar'),
  link: text('link'),
  sortOrder: integer('sort_order').notNull().default(0),
  showAtTopOfProductsPage: boolean('show_at_top_of_products_page').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const featuredProductGroupProducts = pgTable(
  'featured_product_group_products',
  {
    groupId: bigint('group_id', { mode: 'number' }).notNull().references(() => featuredProductGroups.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.productId] }),
    index('idx_featured_group_products_product').on(t.productId),
  ],
);

export const featuredProductGroupBrands = pgTable(
  'featured_product_group_brands',
  {
    groupId: bigint('group_id', { mode: 'number' }).notNull().references(() => featuredProductGroups.id, { onDelete: 'cascade' }),
    brandId: bigint('brand_id', { mode: 'number' }).notNull().references(() => brands.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.brandId] }),
    index('idx_featured_group_brands_brand').on(t.brandId),
  ],
);

export const featuredProductGroupCategories = pgTable(
  'featured_product_group_categories',
  {
    groupId: bigint('group_id', { mode: 'number' }).notNull().references(() => featuredProductGroups.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' }).notNull().references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.categoryId] }),
    index('idx_featured_group_categories_category').on(t.categoryId),
  ],
);

export const productCards = pgTable(
  'product_cards',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' }).notNull().references(() => products.id, { onDelete: 'cascade' }),
    titleAr: text('title_ar').notNull(),
    titleFr: text('title_fr').notNull(),
    descriptionAr: text('description_ar').notNull(),
    descriptionFr: text('description_fr').notNull(),
    characteristicsAr: text('characteristics_ar').array().notNull().default([]),
    characteristicsFr: text('characteristics_fr').array().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_product_cards_product').on(t.productId), index('idx_product_cards_sort_order').on(t.sortOrder)],
);
