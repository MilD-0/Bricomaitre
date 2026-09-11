import { sql } from 'drizzle-orm';
import { bigserial, check, date, index, numeric, text, timestamp } from 'drizzle-orm/pg-core';

import { adminSchema } from './namespaces';

export const offPipelineSales = adminSchema.table(
  'off_pipeline_sales',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    reference: text('reference'),
    description: text('description').notNull(),
    recognizedOn: date('recognized_on').notNull(),
    amountCollected: numeric('amount_collected', { precision: 18, scale: 2 }).notNull(),
    fees: numeric('fees', { precision: 18, scale: 2 }).notNull().default('0'),
    productCost: numeric('product_cost', { precision: 18, scale: 2 }).notNull().default('0'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('off_pipeline_sales_amount_nonnegative_check', sql`${table.amountCollected} >= 0`),
    check('off_pipeline_sales_fees_nonnegative_check', sql`${table.fees} >= 0`),
    check('off_pipeline_sales_product_cost_nonnegative_check', sql`${table.productCost} >= 0`),
    index('idx_off_pipeline_sales_recognized_on').on(table.recognizedOn.desc()),
    index('idx_off_pipeline_sales_reference').on(table.reference),
  ],
);
