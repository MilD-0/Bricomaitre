import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PermissionKey } from './permissions';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('./auth', () => ({ auth: authMock }));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));

import { requirePageAccess } from './page-access';

describe('page access', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([null, { user: { isAllowed: false, permissions: ['settings_manage'] } }])(
    'redirects unauthenticated or unapproved users to the locale entry point',
    async (session) => {
      authMock.mockResolvedValue(session);
      await expect(requirePageAccess('fr', 'administration')).rejects.toThrow('redirect:/fr');
    },
  );

  it('honors granted permissions for a custom role and returns the authenticated session', async () => {
    const session = {
      user: { isAllowed: true, role: 'catalog-editor', permissions: ['products_write'] },
    };
    authMock.mockResolvedValue(session);
    for (const key of ['products', 'inventory', 'aiProposals'] as const) {
      await expect(requirePageAccess('ar', key)).resolves.toBe(session);
    }
  });

  it.each<{ permissions: PermissionKey[]; href: string }>([
    { permissions: ['settings_manage', 'orders_write'], href: '/fr/administration' },
    { permissions: ['orders_write', 'assets_write'], href: '/fr/orders' },
    { permissions: ['analytics_manage'], href: '/fr/stats' },
    { permissions: [], href: '/fr/bulletin' },
  ])(
    'redirects denied access to the first authorized destination: $href',
    async ({ permissions, href }) => {
      authMock.mockResolvedValue({ user: { isAllowed: true, role: 'admin', permissions } });
      await expect(requirePageAccess('fr', 'products')).rejects.toThrow(`redirect:${href}`);
    },
  );

  it('allows an approved user without write permissions to read the bulletin', async () => {
    const session = { user: { isAllowed: true, permissions: [] } };
    authMock.mockResolvedValue(session);
    await expect(requirePageAccess('en', 'bulletin')).resolves.toBe(session);
  });
});
