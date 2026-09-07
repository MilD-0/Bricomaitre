import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
} from '@/lib/action-history-state';
import { POST } from './route';

const { hasDbMock, getDbMock, requireMutationAccessMock, authMock, reorderMock } = vi.hoisted(
  () => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
    authMock: vi.fn(),
    reorderMock: vi.fn(),
  }),
);

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@/lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/asset-mutations', () => ({ reorderAdminAssets: reorderMock }));

describe('app/api/assets/reorder/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    reorderMock.mockReset();
    reorderMock.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid reorder payloads', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ transaction: vi.fn() });

    const req = new NextRequest('http://localhost/api/assets/reorder', {
      method: 'POST',
      body: JSON.stringify({ kind: 'banner', items: [] }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          fieldErrors: expect.objectContaining({ items: expect.any(Array) }),
        }),
      }),
    );
  });

  it('returns 400 for malformed JSON reorder payloads', async () => {
    hasDbMock.mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/assets/reorder', {
      method: 'POST',
      body: '{"kind":',
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('updates banner sort orders with assets RBAC enforced', async () => {
    hasDbMock.mockReturnValue(true);

    getDbMock.mockReturnValue('database');

    const req = new NextRequest('http://localhost/api/assets/reorder', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'banner',
        items: [
          { id: 8, sortOrder: 0 },
          { id: 2, sortOrder: 1 },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(requireMutationAccessMock).toHaveBeenCalledWith('assets');
    expect(reorderMock).toHaveBeenCalledWith(
      'database',
      {
        kind: 'banner',
        items: [
          { id: 8, sortOrder: 0 },
          { id: 2, sortOrder: 1 },
        ],
      },
      { email: 'admin@example.com', name: 'Admin' },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it.each([
    [new ActionHistoryConflictError('Stale order'), 409],
    [new ActionHistoryEntityNotFoundError('assetBanners', 1), 404],
  ])('reports canonical reorder conflicts without claiming success', async (error, status) => {
    hasDbMock.mockReturnValue(true);
    reorderMock.mockRejectedValueOnce(error);
    const response = await POST(
      new NextRequest('http://localhost/api/assets/reorder', {
        method: 'POST',
        body: JSON.stringify({ kind: 'banner', items: [{ id: 1, sortOrder: 0 }] }),
      }),
    );
    expect(response.status).toBe(status);
  });

  it('returns 401 when reorder access is denied', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    }));

    const req = new NextRequest('http://localhost/api/assets/reorder', {
      method: 'POST',
      body: JSON.stringify({ kind: 'banner', items: [{ id: 1, sortOrder: 0 }] }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
