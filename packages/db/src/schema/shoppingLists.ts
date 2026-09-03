import {
  bigserial,
  bigint,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { adminSchema } from './namespaces';

export const shoppingListDrafts = adminSchema.table(
  'shopping_list_drafts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    scopeKey: text('scope_key').notNull(),
    sourceMode: text('source_mode').notNull(),
    orderIds: bigint('order_ids', { mode: 'number' }).array().notNull().default([]),
    title: text('title').notNull(),
    draftItems: jsonb('draft_items').notNull(),
    generatedItems: jsonb('generated_items').notNull(),
    ordersSnapshot: jsonb('orders_snapshot').notNull(),
    revision: integer('revision').notNull().default(0),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    updatedBy: text('updated_by'),
    updatedByName: text('updated_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shopping_list_drafts_scope_key_unique').on(t.scopeKey),
    index('shopping_list_drafts_source_updated_idx').on(t.sourceMode, t.updatedAt),
  ],
);
