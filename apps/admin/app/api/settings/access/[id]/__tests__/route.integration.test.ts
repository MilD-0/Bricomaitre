import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PUT } from '../route';

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

describe('app/api/settings/access/[id]/route', () => {
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
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it.each([
    ['PUT', (request: NextRequest) => PUT(request, { params: Promise.resolve({ id: 'nope' }) })],
    [
      'DELETE',
      (request: NextRequest) => DELETE(request, { params: Promise.resolve({ id: 'nope' }) }),
    ],
  ])(
    'returns 400 before querying for a malformed access grant id in %s',
    async (method, callRoute) => {
      hasDbMock.mockReturnValue(true);
      const request = new NextRequest('http://localhost/api/settings/access/nope', {
        method,
        ...(method === 'PUT'
          ? {
              body: JSON.stringify({
                email: 'employee@example.com',
                role: 'viewer',
                roleDefinitionId: null,
              }),
              headers: { 'content-type': 'application/json' },
            }
          : {}),
      });

      const res = await callRoute(request);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid access grant id' });
      expect(getDbMock).not.toHaveBeenCalled();
    },
  );

  it('updates an existing access grant', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      query: {
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue({ id: 1, email: 'employee@example.com' }),
        },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PUT(
      new NextRequest('http://localhost/api/settings/access/1', {
        method: 'PUT',
        body: JSON.stringify({ email: 'employee@example.com', role: null, roleDefinitionId: 7 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'userAccessGrants',
        entityId: 1,
        operation: 'update',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
  });

  it('deletes an existing access grant', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      query: {
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue({ id: 1, email: 'employee@example.com' }),
        },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await DELETE(
      new NextRequest('http://localhost/api/settings/access/1', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );

    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'userAccessGrants',
        entityId: 1,
        operation: 'delete',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
  });
});
