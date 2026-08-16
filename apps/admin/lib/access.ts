import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import {
  roleDefinitionPermissions,
  roleDefinitions,
  userAccessGrants,
  users,
} from '@bric/db/schema';
import {
  getPermissionsForRole,
  normalizePermissions,
  normalizeBuiltInRole,
  type PermissionKey,
  type Role,
} from './permissions';
import { getConfiguredPrivilegedRole } from './role-config';

export type AccessProfile = {
  isAllowed: boolean;
  permissions: PermissionKey[];
  role: Role;
  roleDefinitionId: number | null;
  roleLabel: string | null;
};

type AccessSeed = {
  email?: string | null;
  permissions?: unknown;
  role?: unknown;
  roleDefinitionId?: number | null;
  roleLabel?: string | null;
};

function createDeniedAccessProfile(): AccessProfile {
  return {
    isAllowed: false,
    permissions: [],
    role: 'viewer',
    roleDefinitionId: null,
    roleLabel: null,
  };
}

async function loadCustomRoleAccess(roleDefinitionId: number) {
  if (!hasDb()) {
    return null;
  }

  const db = getDb();
  const [definition, definitionPermissions] = await Promise.all([
    db.query.roleDefinitions.findFirst({
      where: eq(roleDefinitions.id, roleDefinitionId),
      columns: { id: true, name: true, slug: true },
    }),
    db
      .select({ permission: roleDefinitionPermissions.permission })
      .from(roleDefinitionPermissions)
      .where(eq(roleDefinitionPermissions.roleId, roleDefinitionId)),
  ]);

  if (!definition) {
    return null;
  }

  return {
    isAllowed: true,
    permissions: normalizePermissions(definitionPermissions.map(({ permission }) => permission)),
    role: definition.slug,
    roleDefinitionId: definition.id,
    roleLabel: definition.name,
  } satisfies AccessProfile;
}

async function loadAccessGrantByEmail(email: string) {
  if (!hasDb()) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  return getDb().query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.email, normalizedEmail),
    columns: {
      id: true,
      email: true,
      role: true,
      roleDefinitionId: true,
    },
  });
}

export async function buildAccessProfile(seed: AccessSeed): Promise<AccessProfile> {
  const normalizedEmail = typeof seed.email === 'string' ? seed.email.trim().toLowerCase() : '';
  const configuredPrivilegedRole = getConfiguredPrivilegedRole(normalizedEmail);

  if (configuredPrivilegedRole) {
    return {
      isAllowed: true,
      permissions: getPermissionsForRole(configuredPrivilegedRole),
      role: configuredPrivilegedRole,
      roleDefinitionId: null,
      roleLabel: null,
    };
  }

  if (!normalizedEmail) {
    return createDeniedAccessProfile();
  }

  const accessGrant = await loadAccessGrantByEmail(normalizedEmail);

  if (!accessGrant) {
    return createDeniedAccessProfile();
  }

  if (
    typeof accessGrant.roleDefinitionId === 'number' &&
    Number.isFinite(accessGrant.roleDefinitionId)
  ) {
    const customRoleAccess = await loadCustomRoleAccess(accessGrant.roleDefinitionId);

    if (customRoleAccess) {
      return customRoleAccess;
    }
  }

  const resolvedRole = normalizeBuiltInRole(accessGrant.role ?? seed.role);

  return {
    isAllowed: true,
    permissions: getPermissionsForRole(resolvedRole),
    role: resolvedRole,
    roleDefinitionId: null,
    roleLabel:
      typeof seed.roleLabel === 'string' && seed.roleLabel.trim().length > 0
        ? seed.roleLabel.trim()
        : null,
  };
}

export async function loadAccessProfileForUserId(
  userId: string,
  fallback: Omit<AccessSeed, 'roleDefinitionId'> = {},
): Promise<AccessProfile> {
  if (!hasDb()) {
    return buildAccessProfile(fallback);
  }

  const dbUser = await getDb().query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      email: true,
      role: true,
      roleDefinitionId: true,
    },
  });

  if (!dbUser) {
    return buildAccessProfile(fallback);
  }

  return buildAccessProfile({
    email: dbUser.email,
    role: dbUser.role ?? fallback.role,
  });
}

export async function isEmailAllowed(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase() ?? '';

  if (!normalizedEmail) {
    return false;
  }

  if (getConfiguredPrivilegedRole(normalizedEmail)) {
    return true;
  }

  if (!hasDb()) {
    return false;
  }

  const accessGrant = await loadAccessGrantByEmail(normalizedEmail);
  return Boolean(accessGrant);
}
