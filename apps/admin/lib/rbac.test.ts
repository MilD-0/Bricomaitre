import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock('./auth', () => ({
  auth: authMock,
}));

import { normalizePermissions, normalizeRole } from './permissions';
import {
  canMutateResource,
  requireAnalyticsAccess,
  requireAppAccess,
  requireMutationAccess,
  requireOpsAccess,
  requireSettingsAccess,
} from './rbac';

describe('rbac helpers', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('normalizes unknown roles to viewer', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('something-else')).toBe('something-else');
    expect(normalizeRole(undefined)).toBe('viewer');
  });

  it('normalizes unsupported permissions away', () => {
    expect(normalizePermissions(['products_write', 'unknown_permission'])).toEqual([
      'products_write',
    ]);
  });

  it('enforces edit vs ops permissions by role', () => {
    expect(canMutateResource(['products_write'], 'products')).toBe(true);
    expect(canMutateResource(['orders_write'], 'orders')).toBe(true);
    expect(canMutateResource(['products_write'], 'assets')).toBe(false);
    expect(canMutateResource(['assets_write'], 'assets')).toBe(true);
    expect(canMutateResource(['bulletin_moderate'], 'bulletin')).toBe(true);
  });

  it('returns 401 when the user is not authenticated', async () => {
    authMock.mockResolvedValue(null);

    const res = await requireMutationAccess('products');

    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(401);
    await expect(res?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when the user lacks permission for the resource', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['products_write'] },
    });

    const res = await requireMutationAccess('assets');

    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows ops users through requireOpsAccess', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'developer', permissions: ['ops_view'] },
    });

    await expect(requireOpsAccess()).resolves.toBeNull();
  });

  it('keeps analytics and administration settings access independent from ops', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['analytics_manage'] },
    });
    await expect(requireAnalyticsAccess()).resolves.toBeNull();
    expect((await requireOpsAccess())?.status).toBe(403);
    expect((await requireSettingsAccess())?.status).toBe(403);

    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['settings_manage'] },
    });
    await expect(requireSettingsAccess()).resolves.toBeNull();
    expect((await requireAnalyticsAccess())?.status).toBe(403);
  });

  it('requires analytics_manage for stats mutations', () => {
    expect(canMutateResource(['analytics_manage'], 'stats')).toBe(true);
    expect(canMutateResource(['ops_view'], 'stats')).toBe(false);
  });

  it('allows settings managers through requireSettingsAccess', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'operations-manager', permissions: ['settings_manage'] },
    });

    await expect(requireSettingsAccess()).resolves.toBeNull();
  });

  it('makes the AI assistant available to every allowed user', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'viewer', permissions: [] },
    });
    await expect(requireAppAccess()).resolves.toBeNull();
  });

  it('rejects users without settings permission through requireSettingsAccess', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['ops_view'] },
    });

    const res = await requireSettingsAccess();

    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns null when the user is authorized', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'admin', permissions: ['assets_write'] },
    });

    await expect(requireMutationAccess('assets')).resolves.toBeNull();
  });

  it('blocks authenticated but disallowed users', async () => {
    authMock.mockResolvedValue({ user: { isAllowed: false, role: 'viewer', permissions: [] } });

    const res = await requireOpsAccess();

    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
