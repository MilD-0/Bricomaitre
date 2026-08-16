import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { orders } from './orders';

export const storefrontOrderIdempotency = pgTable(
  'storefront_order_idempotency',
  {
    keyHash: text('key_hash').primaryKey(),
    fingerprint: text('fingerprint').notNull(),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id, {
      onDelete: 'cascade',
    }),
    metaResponse: jsonb('meta_response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_storefront_order_idempotency_order').on(table.orderId),
    index('idx_storefront_order_idempotency_expires').on(table.expiresAt),
  ],
);
