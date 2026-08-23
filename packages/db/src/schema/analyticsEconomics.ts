import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { orders } from './orders';
import { adminSchema } from './namespaces';

export const analyticsEconomicsDailyFacts = adminSchema.table(
  'analytics_economics_daily_facts',
  {
    day: date('day').primaryKey(),
    postedOrders: integer('posted_orders').notNull().default(0),
    paidOrders: integer('paid_orders').notNull().default(0),
    costCompleteOrders: integer('cost_complete_orders').notNull().default(0),
    paidProfitCompleteOrders: integer('paid_profit_complete_orders').notNull().default(0),
    grossProfitDzd: numeric('gross_profit_dzd', { precision: 20, scale: 6 }),
    adjustedProfitDzd: numeric('adjusted_profit_dzd', { precision: 20, scale: 6 }),
    adCostDzd: numeric('ad_cost_dzd', { precision: 20, scale: 6 }).notNull().default('0'),
    operatingCostDzd: numeric('operating_cost_dzd', { precision: 20, scale: 6 })
      .notNull()
      .default('0'),
    netProfitDzd: numeric('net_profit_dzd', { precision: 20, scale: 6 }),
    trueProfitDzd: numeric('true_profit_dzd', { precision: 20, scale: 6 }),
    automaticPaidCodDzd: numeric('automatic_paid_cod_dzd', { precision: 20, scale: 6 })
      .notNull()
      .default('0'),
    automaticPaidFeesDzd: numeric('automatic_paid_fees_dzd', { precision: 20, scale: 6 })
      .notNull()
      .default('0'),
    automaticPaidProfitDzd: numeric('automatic_paid_profit_dzd', {
      precision: 20,
      scale: 6,
    }),
    fxRateUsed: numeric('fx_rate_used', { precision: 16, scale: 4 }).notNull(),
    planningReturnRatePct: numeric('planning_return_rate_pct', {
      precision: 7,
      scale: 4,
    }).notNull(),
    semanticsVersion: integer('semantics_version').notNull().default(1),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_analytics_economics_daily_refreshed').on(table.refreshedAt.desc()),
    check(
      'analytics_economics_daily_counts_nonnegative',
      sql`
      ${table.postedOrders} >= 0
      and ${table.paidOrders} >= 0
      and ${table.costCompleteOrders} >= 0
      and ${table.paidProfitCompleteOrders} >= 0
    `,
    ),
    check('analytics_economics_daily_fx_positive', sql`${table.fxRateUsed} > 0`),
    check(
      'analytics_economics_daily_return_rate_range',
      sql`${table.planningReturnRatePct} >= 0 and ${table.planningReturnRatePct} <= 100`,
    ),
  ],
);

export const analyticsOrderCohortFacts = adminSchema.table(
  'analytics_order_cohort_facts',
  {
    orderId: bigint('order_id', { mode: 'number' })
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    postedDay: date('posted_day').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    outcome: text('outcome').notNull(),
    submittedCodDzd: numeric('submitted_cod_dzd', { precision: 18, scale: 2 }),
    currentCodDzd: numeric('current_cod_dzd', { precision: 18, scale: 2 }),
    deliveryFeeDzd: numeric('delivery_fee_dzd', { precision: 18, scale: 2 }),
    productCostDzd: numeric('product_cost_dzd', { precision: 18, scale: 2 }),
    grossProfitDzd: numeric('gross_profit_dzd', { precision: 18, scale: 2 }),
    automaticPaidProfitDzd: numeric('automatic_paid_profit_dzd', {
      precision: 18,
      scale: 2,
    }),
    costComplete: boolean('cost_complete').notNull().default(false),
    wilayaId: integer('wilaya_id'),
    commune: text('commune'),
    deliveryMode: text('delivery_mode'),
    attemptCount: integer('attempt_count').notNull().default(0),
    metaCampaignId: text('meta_campaign_id'),
    metaAdsetId: text('meta_adset_id'),
    metaAdId: text('meta_ad_id'),
    semanticsVersion: integer('semantics_version').notNull().default(1),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_analytics_cohort_posted_day').on(table.postedDay.desc(), table.orderId),
    index('idx_analytics_cohort_outcome_posted').on(table.outcome, table.postedDay.desc()),
    index('idx_analytics_cohort_paid')
      .on(table.paidAt.desc())
      .where(sql`${table.paidAt} is not null`),
    index('idx_analytics_cohort_wilaya_posted').on(table.wilayaId, table.postedDay.desc()),
    index('idx_analytics_cohort_meta_ad_posted')
      .on(table.metaAdId, table.postedDay.desc())
      .where(sql`${table.metaAdId} is not null`),
    check('analytics_cohort_attempt_count_nonnegative', sql`${table.attemptCount} >= 0`),
  ],
);
