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
  requireAdministrationAccess,
  requireAiAccess,
  requireAiUseAccess,
  requireMutationAccess,
  requireOpsAccess,
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

  it('allows admins through requireAdministrationAccess', async () => {
    authMock.mockResolvedValue({ user: { isAllowed: true, role: 'admin', permissions: [] } });

    await expect(requireAdministrationAccess()).resolves.toBeNull();
  });

  it('requires both base AI and task-specific permissions', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['ai_catalog_propose'] },
    });
    expect((await requireAiAccess('ai_catalog_propose'))?.status).toBe(403);

    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['ai_use', 'ai_catalog_propose'] },
    });
    await expect(requireAiAccess('ai_catalog_propose')).resolves.toBeNull();
  });

  it('allows analytics-only users to open the AI chat while withholding task tools', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['ai_use', 'ai_analytics_query'] },
    });
    await expect(requireAiUseAccess()).resolves.toBeNull();
    expect((await requireAiAccess('ai_catalog_propose'))?.status).toBe(403);
  });

  it('rejects non-admin and non-developer users through requireAdministrationAccess', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, role: 'employee', permissions: ['ops_view'] },
    });

    const res = await requireAdministrationAccess();

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
