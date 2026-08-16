import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  revalidateStorefrontAssetsMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  revalidateStorefrontAssetsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontAssets: revalidateStorefrontAssetsMock,
}));

describe('app/api/assets/reorder/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    revalidateStorefrontAssetsMock.mockReset();
    revalidateStorefrontAssetsMock.mockResolvedValue(undefined);
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

    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    const transactionMock = vi.fn(
      async (callback: (tx: { update: typeof updateMock }) => Promise<void>) => {
        await callback({ update: updateMock });
      },
    );

    getDbMock.mockReturnValue({ transaction: transactionMock });

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
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(setMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sortOrder: 0, updatedAt: expect.any(Date) }),
    );
    expect(setMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sortOrder: 1, updatedAt: expect.any(Date) }),
    );
    expect(revalidateStorefrontAssetsMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('returns 401 when reorder access is denied', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

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
