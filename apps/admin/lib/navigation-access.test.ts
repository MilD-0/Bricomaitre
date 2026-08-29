import { describe, expect, it } from 'vitest';

import { canAccessNavigationItem, canAccessStats } from './navigation-access';

describe('navigation access', () => {
  it('uses analytics_manage as the complete analytics boundary', () => {
    expect(canAccessStats(['analytics_manage'])).toBe(true);
    expect(canAccessStats(['ops_view'])).toBe(false);
    expect(canAccessStats(['settings_manage'])).toBe(false);
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'stats',
        permissions: ['analytics_manage'],
        role: 'employee',
      }),
    ).toBe(true);
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'stats',
        permissions: ['ops_view'],
        role: 'employee',
      }),
    ).toBe(false);
  });

  it('allows settings managers to see Administration without a built-in privileged role', () => {
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'administration',
        permissions: ['settings_manage'],
        role: 'operations-manager',
      }),
    ).toBe(true);
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'administration',
        permissions: ['ops_view'],
        role: 'operations-manager',
      }),
    ).toBe(false);
  });

  it('derives AI proposal review from existing catalog ownership', () => {
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'aiProposals',
        permissions: ['products_write'],
        role: 'employee',
      }),
    ).toBe(true);
    for (const permission of ['assets_write', 'brands_categories_write', 'orders_write'] as const) {
      expect(
        canAccessNavigationItem({
          isAllowed: true,
          key: 'aiProposals',
          permissions: [permission],
          role: 'employee',
        }),
      ).toBe(false);
    }
  });
});
