import {
  pgTable,
  bigserial,
  bigint,
  text,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { products } from './products';

export const productPromoCodes = pgTable(
  'product_promo_codes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    normalizedCode: text('normalized_code').notNull(),
    promoPrice: numeric('promo_price', { precision: 12, scale: 2 }).notNull(),
    active: boolean('active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_promo_codes_product_code_unique').on(t.productId, t.normalizedCode),
    index('idx_product_promo_codes_code_active').on(t.normalizedCode, t.active),
    index('idx_product_promo_codes_product_active').on(t.productId, t.active),
  ],
);
