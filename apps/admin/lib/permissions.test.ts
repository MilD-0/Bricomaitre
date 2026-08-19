import { describe, expect, it } from 'vitest';

import {
  canEdit,
  canExportAllProducts,
  canManageAnalytics,
  canManageSettings,
  canViewOps,
  canViewProfitStats,
  getPermissionsForRole,
  permissionKeySchema,
  roleDefinitionFormSchema,
} from './permissions';

describe('roleDefinitionFormSchema', () => {
  it('requires at least one permission and a valid name', () => {
    expect(roleDefinitionFormSchema.safeParse({ name: 'Ab', permissions: [] }).success).toBe(false);
    expect(
      roleDefinitionFormSchema.safeParse({ name: 'Support', permissions: ['orders_write'] })
        .success,
    ).toBe(true);
  });

  it('rejects unsupported permission keys', () => {
    expect(permissionKeySchema.safeParse('ops_view').success).toBe(true);
    expect(permissionKeySchema.safeParse('bulletin_moderate').success).toBe(true);
    expect(permissionKeySchema.safeParse('ai_catalog_propose').success).toBe(false);
    expect(permissionKeySchema.safeParse('unknown_permission').success).toBe(false);
  });
});

describe('permissions role matrix', () => {
  it('matches expected canEdit permissions', () => {
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('employee')).toBe(true);
    expect(canEdit('admin')).toBe(true);
    expect(canEdit('developer')).toBe(true);
  });

  it('matches expected canViewOps permissions', () => {
    expect(canViewOps('viewer')).toBe(false);
    expect(canViewOps('employee')).toBe(false);
    expect(canViewOps('admin')).toBe(true);
    expect(canViewOps('developer')).toBe(true);
    expect(canViewOps(['settings_manage'])).toBe(false);
    expect(canViewOps(['ops_view'])).toBe(true);
  });

  it('maps built-in roles to the expected permission sets', () => {
    expect(getPermissionsForRole('employee')).toEqual([
      'products_write',
      'orders_write',
      'assets_write',
      'brands_categories_write',
    ]);
    expect(getPermissionsForRole('campaign-manager')).toEqual([]);
  });

  it('keeps settings-specific access separate from generic edit access', () => {
    expect(canManageSettings(['settings_manage'])).toBe(true);
    expect(canManageSettings(['ops_view'])).toBe(false);
  });

  it('limits full product exports to admin and developer roles', () => {
    expect(canExportAllProducts('viewer')).toBe(false);
    expect(canExportAllProducts('employee')).toBe(false);
    expect(canExportAllProducts('admin')).toBe(true);
    expect(canExportAllProducts('developer')).toBe(true);
  });

  it('uses the analytics permission for dashboards and profit data', () => {
    expect(canManageAnalytics(['analytics_manage'])).toBe(true);
    expect(canManageAnalytics(['ops_view'])).toBe(false);
    expect(canViewProfitStats('viewer')).toBe(false);
    expect(canViewProfitStats('employee')).toBe(false);
    expect(canViewProfitStats('admin')).toBe(true);
    expect(canViewProfitStats('developer')).toBe(true);
    expect(canViewProfitStats(['analytics_manage'])).toBe(true);
    expect(canViewProfitStats(['ops_view'])).toBe(false);
  });
});
