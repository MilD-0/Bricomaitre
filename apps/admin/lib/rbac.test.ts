import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('./auth', () => ({ auth: authMock }));

import { normalizePermissions, normalizeRole, type PermissionKey } from './permissions';
import {
  canMutateResource,
  requireAnalyticsAccess,
  requireAppAccess,
  requireMutationAccess,
  requireOpsAccess,
  requireSettingsAccess,
} from './rbac';

const guards = [
  {
    name: 'products',
    permission: 'products_write',
    check: () => requireMutationAccess('products'),
  },
  { name: 'assets', permission: 'assets_write', check: () => requireMutationAccess('assets') },
  {
    name: 'stats mutations',
    permission: 'analytics_manage',
    check: () => requireMutationAccess('stats'),
  },
  { name: 'analytics', permission: 'analytics_manage', check: requireAnalyticsAccess },
  { name: 'settings', permission: 'settings_manage', check: requireSettingsAccess },
  { name: 'operations', permission: 'ops_view', check: requireOpsAccess },
] as const;

describe('RBAC authorization results', () => {
  beforeEach(() => authMock.mockReset());

  it('normalizes unknown role input and drops unsupported permissions', () => {
    expect(normalizeRole(undefined)).toBe('viewer');
    expect(normalizeRole('custom-role')).toBe('custom-role');
    expect(normalizePermissions(['products_write', 'unknown_permission'])).toEqual([
      'products_write',
    ]);
    expect(canMutateResource(['products_write'], 'assets')).toBe(false);
    expect(canMutateResource(['assets_write'], 'assets')).toBe(true);
  });

  it.each(guards)(
    '$name returns the same authorized session after one authentication',
    async ({ permission, check }) => {
      const session = {
        user: { isAllowed: true, permissions: [permission], email: 'operator@example.com' },
      };
      authMock.mockResolvedValue(session);
      const result = await check();
      expect(result.response).toBeNull();
      expect(result.session).toBe(session);
      expect(authMock).toHaveBeenCalledOnce();
    },
  );

  it.each(guards)(
    '$name rejects missing, revoked and insufficient access without exposing a session',
    async ({ permission, check }) => {
      for (const [session, status] of [
        [null, 401],
        [{ user: { isAllowed: false, permissions: [permission] } }, 403],
        [{ user: { isAllowed: true, permissions: [] } }, 403],
        [{ user: { isAllowed: true, permissions: ['unknown_permission'] } }, 403],
      ] as const) {
        authMock.mockResolvedValue(session);
        const result = await check();
        expect(result.session).toBeNull();
        expect(result.response?.status).toBe(status);
        await expect(result.response?.json()).resolves.toEqual({
          error: status === 401 ? 'Unauthorized' : 'Forbidden',
        });
      }
    },
  );

  it('keeps analytics, settings and operations permissions independent', async () => {
    for (const [permission, allowed] of [
      ['analytics_manage', requireAnalyticsAccess],
      ['settings_manage', requireSettingsAccess],
      ['ops_view', requireOpsAccess],
    ] as const) {
      authMock.mockResolvedValue({
        user: { isAllowed: true, permissions: [permission] as PermissionKey[] },
      });
      for (const check of [requireAnalyticsAccess, requireSettingsAccess, requireOpsAccess]) {
        expect((await check()).response?.status ?? null).toBe(check === allowed ? null : 403);
      }
    }
  });

  it('allows an approved viewer into the app without granting mutation permissions', async () => {
    const session = { user: { isAllowed: true, permissions: [] } };
    authMock.mockResolvedValue(session);
    expect((await requireAppAccess()).session).toBe(session);
    expect((await requireMutationAccess('products')).response?.status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await requireAppAccess()).response?.status).toBe(401);
    authMock.mockResolvedValue({ user: { isAllowed: false, permissions: [] } });
    expect((await requireAppAccess()).response?.status).toBe(403);
  });
});
