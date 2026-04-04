import { normalizeRole, type Role } from './permissions';

/**
 * Privileged access is bootstrapped from environment variables.
 * Admin and developer roles are intentionally not assignable from the UI.
 */
function normalizeConfiguredEmails(emails: readonly string[]) {
  return [...new Set(
    emails
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )];
}

function parseConfiguredEmails(rawValue: string | undefined) {
  return normalizeConfiguredEmails((rawValue ?? '').split(','));
}

export const configuredAdminEmails = parseConfiguredEmails(process.env.ADMIN_EMAILS);

export const configuredDeveloperEmails = parseConfiguredEmails(process.env.DEVELOPER_EMAILS);

export const editableRoles = ['viewer', 'employee'] as const;
export const codeManagedRoles = ['admin', 'developer'] as const;

const configuredRoleEmails = {
  admin: new Set(configuredAdminEmails),
  developer: new Set(configuredDeveloperEmails),
};

export function getConfiguredPrivilegedRole(email?: string | null): Role | null {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  if (configuredRoleEmails.developer.has(normalizedEmail)) {
    return 'developer';
  }

  if (configuredRoleEmails.admin.has(normalizedEmail)) {
    return 'admin';
  }

  return null;
}

export function isConfiguredPrivilegedEmail(email?: string | null) {
  return getConfiguredPrivilegedRole(email) !== null;
}

export function resolveUserRole(email: string | null | undefined, persistedRole: unknown): Role {
  const configuredPrivilegedRole = getConfiguredPrivilegedRole(email);

  if (configuredPrivilegedRole) {
    return configuredPrivilegedRole;
  }

  return normalizeRole(persistedRole);
}
