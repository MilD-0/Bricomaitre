import { sql } from 'drizzle-orm';
import { boolean, check, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const aiPricingPolicies = pgTable(
  'ai_pricing_policies',
  {
    id: integer('id').primaryKey().default(1),
    defaultMinimumGrossMargin: numeric('default_minimum_gross_margin', {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default('0.1500'),
    allowRequestOverride: boolean('allow_request_override').notNull().default(true),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ai_pricing_policies_margin_check',
      sql`${table.defaultMinimumGrossMargin} >= 0 and ${table.defaultMinimumGrossMargin} < 1`,
    ),
  ],
);
