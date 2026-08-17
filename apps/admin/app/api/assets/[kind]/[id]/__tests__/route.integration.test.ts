import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH, PUT } from '../route';
import { assetBannerSchema } from '../../../../../../lib/assets';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  revalidateStorefrontAssetsMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  revalidateStorefrontAssetsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontAssets: revalidateStorefrontAssetsMock,
}));

describe('app/api/assets/[kind]/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
    revalidateStorefrontAssetsMock.mockReset();
    revalidateStorefrontAssetsMock.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid toggle payloads', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ marker: 'db' });

    const req = new NextRequest('http://localhost/api/assets/banner/7', {
      method: 'PATCH',
      body: JSON.stringify({ active: 'yes' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ kind: 'banner', id: '7' }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid toggle payload' });
  });

  it.each(['banner', 'product-card'])(
    'rejects featured-group fields on %s toggles before entering the mutation path',
    async (kind) => {
      hasDbMock.mockReturnValue(true);
      getDbMock.mockReturnValue({ marker: 'db' });

      const req = new NextRequest(`http://localhost/api/assets/${kind}/7`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true, showAtTopOfProductsPage: true }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req, { params: Promise.resolve({ kind, id: '7' }) });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid toggle payload' });
      expect(mutateEntityWithHistoryMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'PATCH',
      (request: NextRequest) =>
        PATCH(request, { params: Promise.resolve({ kind: 'banner', id: 'nope' }) }),
    ],
    [
      'PUT',
      (request: NextRequest) =>
        PUT(request, { params: Promise.resolve({ kind: 'banner', id: 'nope' }) }),
    ],
    [
      'DELETE',
      (request: NextRequest) =>
        DELETE(request, { params: Promise.resolve({ kind: 'banner', id: 'nope' }) }),
    ],
  ])('returns 400 for a malformed asset id in %s', async (method, callRoute) => {
    hasDbMock.mockReturnValue(true);
    const request = new NextRequest('http://localhost/api/assets/banner/nope', {
      method,
      ...(method === 'PATCH' || method === 'PUT'
        ? { body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }
        : {}),
    });

    const res = await callRoute(request);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid asset id' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON update payloads', async () => {
    hasDbMock.mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/assets/banner/7', {
      method: 'PATCH',
      body: '{"active":',
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ kind: 'banner', id: '7' }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON request body' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON replacement payloads', async () => {
    hasDbMock.mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/assets/banner/7', {
      method: 'PUT',
      body: '{"data":',
      headers: { 'content-type': 'application/json' },
    });

    const res = await PUT(req, { params: Promise.resolve({ kind: 'banner', id: '7' }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON request body' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('updates banner records with validated payloads', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    vi.spyOn(assetBannerSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Updated banner',
        titleAr: 'بنر محدث',
        imageUrl: 'https://cdn.example.com/updated.jpg',
        imageUrlPortrait: 'https://cdn.example.com/updated-portrait.jpg',
        imageUrlLandscape: 'https://cdn.example.com/updated.jpg',
        productId: 4,
        active: false,
      },
    } as never);

    const req = new NextRequest('http://localhost/api/assets/banner/8', {
      method: 'PUT',
      body: JSON.stringify({ data: {} }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PUT(req, { params: Promise.resolve({ kind: 'banner', id: '8' }) });

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'assetBanners',
        entityId: 8,
        operation: 'update',
      }),
    );
    expect(revalidateStorefrontAssetsMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('deletes product cards through action history', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const req = new NextRequest('http://localhost/api/assets/product-card/12', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: Promise.resolve({ kind: 'product-card', id: '12' }) });

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'productCards',
        entityId: 12,
        operation: 'delete',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
    expect(revalidateStorefrontAssetsMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('returns 401 when update access is denied', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const req = new NextRequest('http://localhost/api/assets/banner/7', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ kind: 'banner', id: '7' }) });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('allows featured-group storefront top placement toggles', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const req = new NextRequest('http://localhost/api/assets/featured-group/7', {
      method: 'PATCH',
      body: JSON.stringify({ showAtTopOfProductsPage: true }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ kind: 'featured-group', id: '7' }) });

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'featuredProductGroups',
        entityId: 7,
        operation: 'update',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
