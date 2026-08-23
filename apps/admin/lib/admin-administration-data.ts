import { asc } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { roleDefinitionPermissions, roleDefinitions, userAccessGrants } from '@bric/db/schema';
import { permissionCatalog, type PermissionKey } from './permissions';

export async function loadAdministrationAccessGrants() {
  const db = getDb();
  const [grants, customRoles] = await Promise.all([
    db.select().from(userAccessGrants).orderBy(asc(userAccessGrants.email)),
    db
      .select({ id: roleDefinitions.id, name: roleDefinitions.name })
      .from(roleDefinitions)
      .orderBy(asc(roleDefinitions.name)),
  ]);

  return {
    items: grants.map((grant) => ({
      ...grant,
      roleLabel: grant.roleDefinitionId
        ? (customRoles.find((role) => role.id === grant.roleDefinitionId)?.name ?? null)
        : null,
    })),
    availableBuiltInRoles: ['viewer', 'employee'] as const,
    availableCustomRoles: customRoles,
  };
}

export async function loadAdministrationRoles() {
  const db = getDb();
  const [roles, permissions] = await Promise.all([
    db.select().from(roleDefinitions).orderBy(asc(roleDefinitions.name)),
    db.select().from(roleDefinitionPermissions).orderBy(asc(roleDefinitionPermissions.roleId)),
  ]);

  return {
    items: roles.map((role) => ({
      ...role,
      permissions: permissions
        .filter((permission) => permission.roleId === role.id)
        .map((permission) => permission.permission) as PermissionKey[],
    })),
    availablePermissions: permissionCatalog,
  };
}
