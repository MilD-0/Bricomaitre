import {
  bigserial,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { products } from './products';

export const landingPageLocaleEnum = pgEnum('landing_page_locale', ['fr', 'ar']);
export const landingPageStatusEnum = pgEnum('landing_page_status', [
  'draft',
  'published',
  'archived',
]);

export const landingPages = pgTable(
  'landing_pages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    locale: landingPageLocaleEnum('locale').notNull(),
    slug: text('slug').notNull(),
    status: landingPageStatusEnum('status').notNull().default('draft'),
    draftRevision: integer('draft_revision').notNull().default(1),
    publishedRevision: integer('published_revision'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_landing_pages_locale_slug').on(table.locale, table.slug),
    index('idx_landing_pages_product').on(table.productId),
    index('idx_landing_pages_publication').on(table.locale, table.status, table.updatedAt),
  ],
);

export const landingPageRevisions = pgTable(
  'landing_page_revisions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    landingPageId: bigint('landing_page_id', { mode: 'number' })
      .notNull()
      .references(() => landingPages.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    document: jsonb('document').notNull(),
    source: text('source').notNull().default('admin'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_landing_page_revisions_page_revision').on(table.landingPageId, table.revision),
    index('idx_landing_page_revisions_page_created').on(table.landingPageId, table.createdAt),
  ],
);
