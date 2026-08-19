import { bigserial, boolean, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const storefrontAnnouncements = pgTable(
  'storefront_announcements',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    locale: text('locale').notNull(),
    message: text('message').notNull(),
    active: boolean('active').notNull().default(false),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('storefront_announcements_locale_unique').on(t.locale)],
);
