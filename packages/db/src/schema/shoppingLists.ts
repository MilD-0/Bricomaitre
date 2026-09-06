import {
  bigserial,
  boolean,
  check,
  primaryKey,
  bigint,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { products } from './products';

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
    allocationVersion: integer('allocation_version').notNull().default(0),
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
    index('shopping_list_drafts_pending_allocation_idx')
      .on(t.allocationVersion)
      .where(sql`${t.allocationVersion} = 0`),
    index('shopping_list_drafts_source_updated_idx').on(t.sourceMode, t.updatedAt),
  ],
);

// Durable consumption belongs to the order, independent of how operators group lists.
export const orderInventoryAllocations = adminSchema.table(
  'order_inventory_allocations',
  {
    // Orders can be deleted while their saved shopping lists remain. Keep consumed
    // quantities so reopening those lists cannot deduct their stock again.
    orderId: bigint('order_id', { mode: 'number' }).notNull(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(0),
    needsReview: boolean('needs_review').notNull().default(false),
    legacyScopeKeys: text('legacy_scope_keys').array().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.productId] }),
    index('order_inventory_allocations_product_idx').on(t.productId),
    check('order_inventory_allocations_quantity_check', sql`${t.quantity} >= 0`),
  ],
);
