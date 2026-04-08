import { z } from 'zod';

export const builtInRoleSchema = z.enum(['viewer', 'employee', 'admin', 'developer']);

export type BuiltInRole = z.infer<typeof builtInRoleSchema>;
export type Role = string;

export const permissionKeySchema = z.enum([
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'bulletin_moderate',
  'ops_view',
  'settings_manage',
]);

export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const permissionCatalog: readonly PermissionKey[] = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'bulletin_moderate',
  'ops_view',
  'settings_manage',
] as const;

export const roleDefinitionFormSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(160).optional().nullable(),
  permissions: z.array(permissionKeySchema).min(1),
});

export const userAccessGrantFormSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['viewer', 'employee']).optional().nullable(),
  roleDefinitionId: z.number().int().positive().optional().nullable(),
}).superRefine((value, ctx) => {
  if (!value.role && !value.roleDefinitionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Assign either a built-in role or a custom role.',
      path: ['role'],
    });
  }

  if (value.role && value.roleDefinitionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose either a built-in role or a custom role, not both.',
      path: ['roleDefinitionId'],
    });
  }
});

export type RoleDefinitionFormValues = z.infer<typeof roleDefinitionFormSchema>;
export type UserAccessGrantFormValues = z.infer<typeof userAccessGrantFormSchema>;

const builtInRolePermissions: Record<BuiltInRole, readonly PermissionKey[]> = {
  viewer: [],
  employee: [
    'products_write',
    'orders_write',
    'assets_write',
    'brands_categories_write',
  ],
  admin: permissionCatalog,
  developer: permissionCatalog,
};

const editorPermissionKeys: readonly PermissionKey[] = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
] as const;

export function isBuiltInRole(role: unknown): role is BuiltInRole {
  return builtInRoleSchema.safeParse(role).success;
}

export function normalizeBuiltInRole(role: unknown): BuiltInRole {
  const parsed = builtInRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : 'viewer';
}

export function normalizeRole(role: unknown): Role {
  if (typeof role !== 'string') {
    return 'viewer';
  }

  const normalizedRole = role.trim();
  return normalizedRole.length > 0 ? normalizedRole : 'viewer';
}

export function normalizePermissions(permissions: unknown): PermissionKey[] {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return permissions.flatMap((permission) => {
    const parsed = permissionKeySchema.safeParse(permission);
    return parsed.success ? [parsed.data] : [];
  });
}

export function getPermissionsForRole(role: unknown): PermissionKey[] {
  if (!isBuiltInRole(role)) {
    return [];
  }

  return [...builtInRolePermissions[role]];
}

function resolvePermissionSet(access: Role | readonly PermissionKey[]) {
  return Array.isArray(access) ? normalizePermissions(access) : getPermissionsForRole(access);
}

export function hasPermission(access: Role | readonly PermissionKey[], permission: PermissionKey) {
  return resolvePermissionSet(access).includes(permission);
}

export const canEdit = (access: Role | readonly PermissionKey[]) =>
  editorPermissionKeys.some((permission) => hasPermission(access, permission));

export const canViewOps = (access: Role | readonly PermissionKey[]) =>
  hasPermission(access, 'ops_view') || hasPermission(access, 'settings_manage');

export const canManageSettings = (access: Role | readonly PermissionKey[]) =>
  hasPermission(access, 'settings_manage');

export function canExportAllProducts(role: unknown) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'admin' || normalizedRole === 'developer';
}
