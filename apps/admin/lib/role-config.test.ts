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
    process.env.DEVELOPER_EMAILS = 'developer@example.com,dev@example.com';
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
});
