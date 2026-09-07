import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_categories_parent').on(t.parentId),
    index('idx_categories_mongo_id').on(t.mongoId),
    uniqueIndex('categories_slug_unique').on(t.slug),
    check(
      'categories_not_self_parent_check',
      sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`,
    ),
  ],
);
