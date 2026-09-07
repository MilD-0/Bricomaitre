import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PUT } from '../route';

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

describe('app/api/settings/roles/[id]/route', () => {
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

  it('returns 401 when ops access is denied', async () => {
    requireOpsAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    }));

    const res = await PUT(
      new NextRequest('http://localhost/api/settings/roles/5', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Support', permissions: ['orders_write'] }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '5' }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when the role does not exist', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: { roleDefinitions: { findFirst: vi.fn().mockResolvedValue(undefined) } },
    });

    const res = await PUT(
      new NextRequest('http://localhost/api/settings/roles/5', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Support', permissions: ['orders_write'] }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '5' }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Role not found' });
  });

  it('returns 400 before querying for a malformed role id', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await PUT(
      new NextRequest('http://localhost/api/settings/roles/nope', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Support', permissions: ['orders_write'] }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'nope' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid role id' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('updates an existing role and replaces permissions', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      query: {
        roleDefinitions: { findFirst: vi.fn().mockResolvedValue({ id: 5, name: 'Support' }) },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PUT(
      new NextRequest('http://localhost/api/settings/roles/5', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Support Lead',
          description: 'Leads support',
          permissions: ['orders_write', 'ops_view'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '5' }) },
    );

    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'roleDefinitions',
        entityId: 5,
        operation: 'update',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
  });
});
