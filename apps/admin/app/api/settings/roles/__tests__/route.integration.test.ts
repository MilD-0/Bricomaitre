import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const { hasDbMock, getDbMock, requireOpsAccessMock, authMock, mutateEntityWithHistoryMock } =
  vi.hoisted(() => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    requireOpsAccessMock: vi.fn(),
    authMock: vi.fn(),
    mutateEntityWithHistoryMock: vi.fn(),
  }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@/lib/rbac', () => ({
  requireSettingsAccess: requireOpsAccessMock,
}));
vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));
vi.mock('@/lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/settings/roles/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    requireOpsAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockImplementation(async (_db, params) =>
      params.execute({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 9 }]),
          })),
        })),
      }),
    );
  });

  it('returns 403 when ops access is denied', async () => {
    requireOpsAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const res = await GET();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('lists existing custom roles and permission catalog', async () => {
    hasDbMock.mockReturnValue(true);
    const roleOrderBy = vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Support',
        slug: 'support',
        description: null,
        isSystem: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const permissionOrderBy = vi
      .fn()
      .mockResolvedValue([{ roleId: 1, permission: 'orders_write' }]);
    const from = vi
      .fn()
      .mockReturnValueOnce({ orderBy: roleOrderBy })
      .mockReturnValueOnce({ orderBy: permissionOrderBy });
    const select = vi.fn(() => ({ from }));
    getDbMock.mockReturnValue({ select });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [expect.objectContaining({ id: 1, name: 'Support', permissions: ['orders_write'] })],
      availablePermissions: expect.arrayContaining(['products_write', 'settings_manage']),
    });
  });

  it('creates a role with assigned permissions', async () => {
    hasDbMock.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = { query: { roleDefinitions: { findFirst } } };

    mutateEntityWithHistoryMock.mockResolvedValue([{ id: 9 }]);
    getDbMock.mockReturnValue(db);

    const res = await POST(
      new NextRequest('http://localhost/api/settings/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Campaign Manager',
          description: 'Handles paid media',
          permissions: ['brands_categories_write', 'settings_manage'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'roleDefinitions',
        operation: 'create',
        actor: { email: 'admin@example.com', name: 'Admin' },
        resolveEntityId: expect.any(Function),
      }),
    );
  });
});
