import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { products } from './products';

export const productSlugHistory = pgTable(
  'product_slug_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    replacedAt: timestamp('replaced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_slug_history_slug_unique').on(t.slug),
    index('idx_product_slug_history_product').on(t.productId, t.replacedAt.desc()),
  ],
);
