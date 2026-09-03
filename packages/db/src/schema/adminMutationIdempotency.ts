import { jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const adminMutationIdempotency = pgTable(
  'admin_mutation_idempotency',
  {
    scope: text('scope').notNull(),
    requestId: text('request_id').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_mutation_idempotency_scope_request_unique').on(table.scope, table.requestId),
  ],
);
