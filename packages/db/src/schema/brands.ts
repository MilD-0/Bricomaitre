import {
  pgTable,
  bigserial,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const brands = pgTable(
  'brands',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    mongoId: text('mongo_id'),
    image: text('image'),
    isActive: boolean('is_active').notNull().default(true),
    featured: boolean('featured').notNull().default(false),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    updatedBy: text('updated_by'),
    updatedByName: text('updated_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brands_slug_unique').on(t.slug), index('idx_brands_mongo_id').on(t.mongoId)],
);
