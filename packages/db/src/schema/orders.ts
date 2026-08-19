import {
  pgTable,
  bigserial,
  bigint,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products';

export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    mongoId: text('mongo_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    state: integer('state'),
    city: text('city'),
    homeAddress: text('home_address'),
    email: text('email'),
    phoneNumber1: text('phone_number_1').notNull(),
    normalizedPhone: text('normalized_phone'),
    phoneNumber2: text('phone_number_2'),
    publicToken: text('public_token'),
    cartProducts: text('cart_products').array().notNull().default([]),
    visitId: text('visit_id'),
    journeyId: text('journey_id'),
    sessionId: text('session_id'),
    variant: text('variant'),
    delivery: integer('delivery').notNull().default(0),
    delPr: numeric('del_pr', { precision: 10, scale: 2 }),
    productSubtotal: numeric('product_subtotal', { precision: 12, scale: 2 }),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
    price: numeric('price', { precision: 12, scale: 2 }),
    promoCode: text('promo_code'),
    promoProductId: bigint('promo_product_id', { mode: 'number' }).references(() => products.id, {
      onDelete: 'set null',
    }),
    promoOriginalSubtotal: numeric('promo_original_subtotal', { precision: 12, scale: 2 }),
    promoDiscountAmount: numeric('promo_discount_amount', { precision: 12, scale: 2 }),
    promoFinalSubtotal: numeric('promo_final_subtotal', { precision: 12, scale: 2 }),
    note: text('note'),

    confirmed: integer('confirmed').notNull().default(0),
    noAnswerCount: integer('no_answer_count').notNull().default(0),
    confirmedBy: text('confirmed_by'),
    confirmedByName: text('confirmed_by_name'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

    ecotrackStatus: text('ecotrack_status'),
    ecotrackStatusLastUpdate: timestamp('ecotrack_status_last_update', {
      withTimezone: true,
    }),
    ecotrackStatusData: jsonb('ecotrack_status_data'),
    ecotrackReference: text('ecotrack_reference'),
    ecotrackTrackingNumber: text('ecotrack_tracking_number'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_orders_mongo_id').on(t.mongoId),
    index('idx_orders_confirmed').on(t.confirmed),
    index('idx_orders_created').on(t.createdAt),
    index('idx_orders_visit').on(t.visitId),
    index('idx_orders_journey').on(t.journeyId),
    index('idx_orders_session').on(t.sessionId),
    index('idx_orders_promo_product')
      .on(t.promoProductId)
      .where(sql`${t.promoProductId} is not null`),
    index('idx_orders_normalized_phone_created').on(t.normalizedPhone, t.createdAt.desc()),
    index('idx_orders_cart_products_gin').using('gin', t.cartProducts),
    uniqueIndex('orders_public_token_unique').on(t.publicToken),
    index('idx_orders_created_desc').on(t.createdAt.desc()),
    index('idx_orders_confirmed_created_desc').on(t.confirmed, t.createdAt.desc()),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: integer('status').notNull().default(0),
    noAnswerCount: integer('no_answer_count').notNull().default(0),
    changedBy: text('changed_by'),
    changedByName: text('changed_by_name'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_osh_order').on(t.orderId, t.changedAt)],
);
