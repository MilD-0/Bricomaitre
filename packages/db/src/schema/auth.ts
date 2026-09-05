import {
  boolean,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { roleDefinitions } from './roleDefinitions';
import { adminSchema } from './namespaces';

export const userRoleEnum = adminSchema.enum('admin_user_role', [
  'viewer',
  'employee',
  'admin',
  'developer',
]);

export const users = adminSchema.table(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email'),
    emailVerifiedAt: timestamp('email_verified', { withTimezone: true }),
    emailVerified: boolean('email_verified_flag').notNull().default(true),
    image: text('image'),
    role: userRoleEnum('role').notNull().default('viewer'),
    roleDefinitionId: integer('role_definition_id').references(() => roleDefinitions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    index('users_role_definition_id_idx').on(t.roleDefinitionId),
  ],
);

export const accounts = adminSchema.table(
  'accounts',
  {
    id: text('id')
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    accountId: text('provider_account_id').notNull(),
    providerId: text('provider').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    legacyType: text('type'),
    legacyExpiresAt: integer('expires_at'),
    legacyTokenType: text('token_type'),
    legacySessionState: text('session_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.accountId] }),
    uniqueIndex('accounts_id_unique').on(t.id),
    uniqueIndex('accounts_issuer_account_id_unique').on(t.issuer, t.accountId),
    index('accounts_user_id_idx').on(t.userId),
  ],
);

export const sessions = adminSchema.table(
  'sessions',
  {
    id: text('id')
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    token: text('session_token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_id_unique').on(t.id), index('sessions_user_id_idx').on(t.userId)],
);

export const verificationTokens = adminSchema.table(
  'verification_tokens',
  {
    id: text('id')
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    identifier: text('identifier').notNull(),
    value: text('token').notNull(),
    expiresAt: timestamp('expires', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.identifier, t.value] }),
    uniqueIndex('verification_tokens_id_unique').on(t.id),
    uniqueIndex('verification_tokens_token_unique').on(t.value),
  ],
);
