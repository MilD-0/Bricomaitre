import { describe, expect, it } from 'vitest';

import { canAccessNavigationItem } from './navigation-access';

describe('navigation access', () => {
  it('uses analytics_manage as the complete analytics boundary', () => {
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'stats',
        permissions: ['analytics_manage'],
      }),
    ).toBe(true);
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'stats',
        permissions: ['ops_view'],
      }),
    ).toBe(false);
  });

  it('allows settings managers to see Administration without a built-in privileged role', () => {
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'administration',
        permissions: ['settings_manage'],
      }),
    ).toBe(true);
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'administration',
        permissions: ['ops_view'],
      }),
    ).toBe(false);
  });

  it('derives AI proposal review from existing catalog ownership', () => {
    expect(
      canAccessNavigationItem({
        isAllowed: true,
        key: 'aiProposals',
        permissions: ['products_write'],
      }),
    ).toBe(true);
    for (const permission of ['assets_write', 'brands_categories_write', 'orders_write'] as const) {
      expect(
        canAccessNavigationItem({
          isAllowed: true,
          key: 'aiProposals',
          permissions: [permission],
        }),
      ).toBe(false);
    }
  });
});
