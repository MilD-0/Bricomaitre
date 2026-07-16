import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const storefrontSettings = pgTable('storefront_settings', {
  id: integer('id').primaryKey().default(1),
  contactPhone: text('contact_phone').notNull().default('0795342826'),
  phoneEnabled: boolean('phone_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
