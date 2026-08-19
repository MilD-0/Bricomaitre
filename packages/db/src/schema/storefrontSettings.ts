import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const storefrontSettings = pgTable('storefront_settings', {
  id: integer('id').primaryKey().default(1),
  contactPhone: text('contact_phone').notNull().default('0795342826'),
  phoneEnabled: boolean('phone_enabled').notNull().default(true),
  contactEmail: text('contact_email'),
  address: text('address'),
  mapUrl: text('map_url'),
  facebookUrl: text('facebook_url'),
  aiAssistantEnabled: boolean('ai_assistant_enabled').notNull().default(true),
  aiModel: text('ai_model').notNull().default('gpt-5-mini'),
  aiFallbackModel: text('ai_fallback_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
