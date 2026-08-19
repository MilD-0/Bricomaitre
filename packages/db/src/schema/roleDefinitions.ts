import {
  boolean,
  index,
  integer,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { adminSchema } from './namespaces';

export const rolePermissionEnum = adminSchema.enum('admin_role_permission', [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'bulletin_moderate',
  'ops_view',
  'analytics_manage',
  'settings_manage',
]);

export const roleDefinitions = adminSchema.table(
  'role_definitions',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('role_definitions_name_unique').on(t.name),
    uniqueIndex('role_definitions_slug_unique').on(t.slug),
  ],
);

export const roleDefinitionPermissions = adminSchema.table(
  'role_definition_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => roleDefinitions.id, { onDelete: 'cascade' }),
    permission: rolePermissionEnum('permission').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permission] }),
    index('role_definition_permissions_role_id_idx').on(t.roleId),
  ],
);
