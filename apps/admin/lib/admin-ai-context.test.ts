import { describe, expect, it } from 'vitest';

import { navigationKeys } from './navigation';
import { adminAiSurfaceContextSchema, resolveAdminAiSurfaceContext } from './admin-ai-context';

describe('admin AI surface context', () => {
  it.each([
    ['/en/administration/users', 'administration', 'users'],
    ['/fr/products', 'products', null],
    ['/ar/ai-proposals', 'aiProposals', null],
    ['/en/orders/ecotrack', 'orders', 'ecotrack'],
    ['/en/inventory', 'inventory', null],
    ['/en/assets/featured-groups', 'assets', 'featuredGroups'],
    ['/en/brands', 'brandsCategories', 'brands'],
    ['/en/categories', 'brandsCategories', 'categories'],
    ['/en/stats/search', 'stats', 'search'],
    ['/en/bulletin', 'bulletin', null],
  ])('maps %s to its live admin surface', (pathname, surface, section) => {
    expect(resolveAdminAiSurfaceContext(pathname)).toMatchObject({ surface, section });
  });

  it('covers every navigation family and every canonical analytics view', () => {
    const routes = [
      '/en/administration',
      '/en/products',
      '/en/ai-proposals',
      '/en/orders',
      '/en/inventory',
      '/en/assets',
      '/en/brands',
      '/en/stats',
      '/en/bulletin',
    ];
    expect(routes.map((route) => resolveAdminAiSurfaceContext(route).surface)).toEqual(
      navigationKeys,
    );
    expect(
      [
        '/en/stats',
        '/en/stats/time',
        '/en/stats/meta-ads',
        '/en/stats/fulfillment',
        '/en/stats/website',
        '/en/stats/search',
        '/en/stats/products',
        '/en/stats/costs',
      ].map((route) => resolveAdminAiSurfaceContext(route).section),
    ).toEqual([
      'command',
      'money',
      'acquisition',
      'fulfillment',
      'storefront',
      'search',
      'catalog',
      'assumptions',
    ]);
  });

  it('keeps only safe Analytics2 filters and resolves focused landing pages', () => {
    expect(
      resolveAdminAiSurfaceContext(
        '/fr/stats/meta-ads',
        new URLSearchParams(
          'range=custom&startDate=2026-08-01&endDate=2026-08-20&grain=day&customer=secret',
        ),
      ).filters,
    ).toEqual({
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-20',
      grain: 'day',
    });
    expect(resolveAdminAiSurfaceContext('/en/assets/landing-pages/42').selection).toEqual({
      entityType: 'landingPage',
      ids: [42],
      focusedId: 42,
    });
  });

  it('bounds client-supplied selections at the request contract', () => {
    expect(
      adminAiSurfaceContextSchema.safeParse({
        locale: 'en',
        surface: 'products',
        pathname: '/en/products',
        selection: {
          entityType: 'product',
          ids: Array.from({ length: 501 }, (_, index) => index + 1),
        },
      }).success,
    ).toBe(false);
  });
});
