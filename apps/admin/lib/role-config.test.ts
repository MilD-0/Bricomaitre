import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('role config', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  const originalDeveloperEmails = process.env.DEVELOPER_EMAILS;

  async function loadRoleConfig() {
    return import('./role-config');
  }

  beforeEach(async () => {
    vi.resetModules();
    process.env.ADMIN_EMAILS = 'admin@example.com,owner@example.com';
    process.env.DEVELOPER_EMAILS = 'private-contact-01@example.invalid,dev@example.com';
  });

  afterEach(() => {
    if (typeof originalAdminEmails === 'undefined') {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalAdminEmails;
    }

    if (typeof originalDeveloperEmails === 'undefined') {
      delete process.env.DEVELOPER_EMAILS;
    } else {
      process.env.DEVELOPER_EMAILS = originalDeveloperEmails;
    }
  });

  it('keeps editable and code-managed role groups separate', async () => {
    const { editableRoles, codeManagedRoles } = await loadRoleConfig();
    expect(editableRoles).toEqual(['viewer', 'employee']);
    expect(codeManagedRoles).toEqual(['admin', 'developer']);
  });

  it('maps configured emails to privileged roles', async () => {
    const { configuredAdminEmails, configuredDeveloperEmails, getConfiguredPrivilegedRole } =
      await loadRoleConfig();

    expect(getConfiguredPrivilegedRole(configuredAdminEmails[0])).toBe('admin');
    expect(getConfiguredPrivilegedRole(configuredDeveloperEmails[0])).toBe('developer');
    expect(getConfiguredPrivilegedRole('viewer@example.com')).toBeNull();
  });

  it('normalizes configured email lists and supports more than one privileged email', async () => {
    const { configuredAdminEmails, configuredDeveloperEmails, isConfiguredPrivilegedEmail } =
      await loadRoleConfig();

    expect(configuredAdminEmails).toContain('admin@example.com');
    expect(configuredAdminEmails).toContain('owner@example.com');
    expect(new Set(configuredAdminEmails).size).toBe(configuredAdminEmails.length);
    expect(isConfiguredPrivilegedEmail(' ADMIN@EXAMPLE.COM ')).toBe(true);
    expect(isConfiguredPrivilegedEmail(configuredDeveloperEmails[0]?.toUpperCase())).toBe(true);
  });

  it('preserves non-privileged persisted roles', async () => {
    const { resolveUserRole } = await loadRoleConfig();
    expect(resolveUserRole('viewer@example.com', 'viewer')).toBe('viewer');
    expect(resolveUserRole('employee@example.com', 'employee')).toBe('employee');
  });

  it('forces privileged roles to come from configured emails', async () => {
    const { configuredAdminEmails, configuredDeveloperEmails, resolveUserRole } =
      await loadRoleConfig();

    expect(resolveUserRole('viewer@example.com', 'admin')).toBe('admin');
    expect(resolveUserRole('viewer@example.com', 'developer')).toBe('developer');
    expect(resolveUserRole(configuredAdminEmails[0], 'viewer')).toBe('admin');
    expect(resolveUserRole(configuredDeveloperEmails[0], 'viewer')).toBe('developer');
  });

  it('preserves custom persisted roles for runtime RBAC lookups', async () => {
    const { resolveUserRole } = await loadRoleConfig();
    expect(resolveUserRole('viewer@example.com', 'campaign-manager')).toBe('campaign-manager');
  });
});
