import { NextRequest } from 'next/server';
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

vi.mock('../../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));
vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));
vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/settings/access/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue([{ id: 1 }]);
  });

  it('lists access grants and custom roles', async () => {
    hasDbMock.mockReturnValue(true);
    const accessOrderBy = vi.fn().mockResolvedValue([
      {
        id: 1,
        email: 'employee@example.com',
        role: 'viewer',
        roleDefinitionId: 7,
        createdAt: new Date('2026-03-31T00:00:00.000Z'),
        updatedAt: new Date('2026-03-31T00:00:00.000Z'),
      },
    ]);
    const roleOrderBy = vi.fn().mockResolvedValue([{ id: 7, name: 'Campaign Manager' }]);
    const from = vi
      .fn()
      .mockReturnValueOnce({ orderBy: accessOrderBy })
      .mockReturnValueOnce({ orderBy: roleOrderBy });
    getDbMock.mockReturnValue({ select: vi.fn(() => ({ from })) });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          email: 'employee@example.com',
          roleDefinitionId: 7,
          roleLabel: 'Campaign Manager',
        }),
      ],
      availableBuiltInRoles: ['viewer', 'employee'],
      availableCustomRoles: [{ id: 7, name: 'Campaign Manager' }],
    });
  });

  it('creates a new access grant', async () => {
    hasDbMock.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: { userAccessGrants: { findFirst } },
    };
    getDbMock.mockReturnValue(db);

    const res = await POST(
      new NextRequest('http://localhost/api/settings/access', {
        method: 'POST',
        body: JSON.stringify({
          email: 'Employee@Example.com',
          role: 'employee',
          roleDefinitionId: null,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'userAccessGrants',
        operation: 'create',
        actor: { email: 'admin@example.com', name: 'Admin' },
        resolveEntityId: expect.any(Function),
      }),
    );
  });
});
