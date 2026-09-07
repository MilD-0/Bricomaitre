import { describe, expect, it } from 'vitest';

import {
  canExportAllProducts,
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
  it('maps built-in roles to the expected permission sets', () => {
    expect(getPermissionsForRole('employee')).toEqual([
      'products_write',
      'orders_write',
      'assets_write',
      'brands_categories_write',
    ]);
    expect(getPermissionsForRole('campaign-manager')).toEqual([]);
  });

  it('limits full product exports to admin and developer roles', () => {
    expect(canExportAllProducts({ role: 'viewer' })).toBe(false);
    expect(canExportAllProducts({ role: 'employee' })).toBe(false);
    expect(canExportAllProducts({ role: 'admin' })).toBe(true);
    expect(canExportAllProducts({ role: 'developer' })).toBe(true);
  });

  it('uses the analytics permission for dashboards and profit data', () => {
    expect(canViewProfitStats('viewer')).toBe(false);
    expect(canViewProfitStats('employee')).toBe(false);
    expect(canViewProfitStats('admin')).toBe(true);
    expect(canViewProfitStats('developer')).toBe(true);
    expect(canViewProfitStats(['analytics_manage'])).toBe(true);
    expect(canViewProfitStats(['ops_view'])).toBe(false);
  });
});

it('rejects reserved custom names and denies privileged exports to existing custom-role collisions', () => {
  for (const name of ['Admin', ' DEVELOPER ', '--admin--', 'Employee', 'Viewer']) {
    expect(
      roleDefinitionFormSchema.safeParse({ name, permissions: ['assets_write'] }).success,
    ).toBe(false);
  }
  expect(canExportAllProducts({ role: 'admin', roleDefinitionId: 7 })).toBe(false);
  expect(canExportAllProducts({ role: 'developer', roleDefinitionId: 8 })).toBe(false);
});
