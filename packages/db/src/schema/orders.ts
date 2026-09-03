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
    publicTokenExpiresAt: timestamp('public_token_expires_at', { withTimezone: true }),
    cartProducts: text('cart_products').array().notNull().default([]),
    visitId: text('visit_id'),
    journeyId: text('journey_id'),
    sessionId: text('session_id'),
    variant: text('variant'),
    delivery: integer('delivery').notNull().default(0),
    deliveryFee: numeric('del_pr', { precision: 10, scale: 2 }),
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

    inHouseStatus: integer('confirmed').notNull().default(0),
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
    index('idx_orders_confirmed').on(t.inHouseStatus),
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
    index('idx_orders_public_token_expires').on(t.publicTokenExpiresAt),
    index('idx_orders_created_desc').on(t.createdAt.desc()),
    index('idx_orders_confirmed_created_desc').on(t.inHouseStatus, t.createdAt.desc()),
    check('orders_state_check', sql`${t.state} is null or ${t.state} between 1 and 58`),
    check('orders_delivery_check', sql`${t.delivery} in (0, 1)`),
    check('orders_status_check', sql`${t.inHouseStatus} between 0 and 11`),
    check('orders_no_answer_count_check', sql`${t.noAnswerCount} >= 0`),
    check(
      'orders_amounts_nonnegative_check',
      sql`${t.deliveryFee} is null or ${t.deliveryFee} >= 0`,
    ),
    check(
      'orders_commercial_amounts_nonnegative_check',
      sql`(${t.productSubtotal} is null or ${t.productSubtotal} >= 0)
        and (${t.totalAmount} is null or ${t.totalAmount} >= 0)
        and (${t.price} is null or ${t.price} >= 0)
        and (${t.promoOriginalSubtotal} is null or ${t.promoOriginalSubtotal} >= 0)
        and (${t.promoDiscountAmount} is null or ${t.promoDiscountAmount} >= 0)
        and (${t.promoFinalSubtotal} is null or ${t.promoFinalSubtotal} >= 0)`,
    ),
    check(
      'orders_public_token_expiry_check',
      sql`${t.publicTokenExpiresAt} is null or ${t.publicToken} is not null`,
    ),
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
  (t) => [
    index('idx_osh_order').on(t.orderId, t.changedAt),
    index('idx_osh_status_changed_order').on(t.status, t.changedAt, t.orderId),
    check('order_status_history_status_check', sql`${t.status} between 0 and 11`),
    check('order_status_history_no_answer_count_check', sql`${t.noAnswerCount} >= 0`),
  ],
);
