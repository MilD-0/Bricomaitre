import { index, integer, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { userRoleEnum } from './auth';
import { adminSchema } from './namespaces';
import { roleDefinitions } from './roleDefinitions';

export const userAccessGrants = adminSchema.table(
  'user_access_grants',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull().default('viewer'),
    roleDefinitionId: integer('role_definition_id').references(() => roleDefinitions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_access_grants_email_unique').on(t.email),
    index('user_access_grants_role_definition_id_idx').on(t.roleDefinitionId),
  ],
);
