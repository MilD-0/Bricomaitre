import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { adminSchema } from './namespaces';

export const profitTrackerSettings = adminSchema.table(
  'profit_tracker_settings',
  {
    id: integer('id').primaryKey().default(1),
    fxRate: numeric('fx_rate', { precision: 16, scale: 4 }).notNull().default('280'),
    defaultReturnRate: numeric('default_return_rate', { precision: 7, scale: 4 })
      .notNull()
      .default('10'),
    restFrom: date('rest_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('profit_tracker_settings_singleton_check', sql`${table.id} = 1`),
    check('profit_tracker_settings_fx_positive_check', sql`${table.fxRate} > 0`),
    check(
      'profit_tracker_settings_return_rate_check',
      sql`${table.defaultReturnRate} >= 0 and ${table.defaultReturnRate} <= 100`,
    ),
  ],
);

export const profitTrackerDays = adminSchema.table(
  'profit_tracker_days',
  {
    day: date('day').primaryKey(),
    spendEur: numeric('spend_eur', { precision: 16, scale: 4 }),
    fbPurchases: numeric('fb_purchases', { precision: 14, scale: 4 }),
    cpm: numeric('cpm', { precision: 16, scale: 4 }),
    ctr: numeric('ctr', { precision: 9, scale: 4 }),
    linkClicks: integer('link_clicks'),
    landingPageViews: numeric('landing_page_views', { precision: 14, scale: 4 }),
    grossProfitDzd: numeric('gross_profit_dzd', { precision: 18, scale: 2 }),
    returnRatePct: numeric('return_rate_pct', { precision: 7, scale: 4 }),
    confirmedOrders: integer('confirmed_orders'),
    note: text('note'),
    rawMetaJson: jsonb('raw_meta_json'),
    fxRateUsed: numeric('fx_rate_used', { precision: 16, scale: 4 }).notNull(),
    metaSyncedAt: timestamp('meta_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('profit_tracker_days_spend_nonnegative_check', sql`${table.spendEur} >= 0`),
    check('profit_tracker_days_fx_positive_check', sql`${table.fxRateUsed} > 0`),
    check(
      'profit_tracker_days_return_rate_check',
      sql`${table.returnRatePct} >= 0 and ${table.returnRatePct} <= 100`,
    ),
    check('profit_tracker_days_confirmed_nonnegative_check', sql`${table.confirmedOrders} >= 0`),
    index('idx_profit_tracker_days_meta_synced').on(table.metaSyncedAt.desc()),
  ],
);

export const profitTrackerOperatingCosts = adminSchema.table(
  'profit_tracker_operating_costs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    amountDzd: numeric('amount_dzd', { precision: 18, scale: 2 }).notNull(),
    period: text('period').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('profit_tracker_costs_amount_nonnegative_check', sql`${table.amountDzd} >= 0`),
    check('profit_tracker_costs_period_check', sql`${table.period} in ('monthly', 'once')`),
    check(
      'profit_tracker_costs_date_order_check',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    index('idx_profit_tracker_costs_period_start').on(table.period, table.startDate),
    index('idx_profit_tracker_costs_end').on(table.endDate),
  ],
);
