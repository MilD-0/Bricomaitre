import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';
import { assetBannerSchema, featuredProductGroupSchema } from '../../../../lib/assets';

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

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontAssets: revalidateStorefrontAssetsMock,
}));

describe('app/api/assets/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue([{ id: 77 }]);
    revalidateStorefrontAssetsMock.mockReset();
    revalidateStorefrontAssetsMock.mockResolvedValue(undefined);
  });

  it('returns 401 when assets mutation access is denied', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const req = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ kind: 'banner', data: {} }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid featured group payloads', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(featuredProductGroupSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { productIds: ['invalid'] } }) },
    } as never);

    const req = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ kind: 'featuredGroup', data: {} }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: { fieldErrors: { productIds: ['invalid'] } },
    });
  });

  it('returns 400 for malformed JSON without entering the database path', async () => {
    hasDbMock.mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      body: '{"kind":',
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON request body' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('creates a banner via action history with assets RBAC', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    const selectFromMock = vi.fn().mockResolvedValue([{ value: 4 }]);
    const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });
    getDbMock.mockReturnValue({ ...db, select: selectMock });

    vi.spyOn(assetBannerSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Homepage hero',
        titleAr: 'بانر الواجهة',
        imageUrl: 'https://cdn.example.com/banner.jpg',
        imageUrlPortrait: null,
        imageUrlLandscape: 'https://cdn.example.com/banner.jpg',
        productId: 15,
        active: true,
      },
    } as never);

    const req = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ kind: 'banner', data: {} }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(requireMutationAccessMock).toHaveBeenCalledWith('assets');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining(db),
      expect.objectContaining({
        entityType: 'assetBanners',
        operation: 'create',
        actor: { email: 'admin@example.com', name: 'Admin' },
        execute: expect.any(Function),
        resolveEntityId: expect.any(Function),
      }),
    );

    const { execute, resolveEntityId } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const valuesMock = vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 77 }]) });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    await execute({ insert: insertMock });

    expect(insertMock).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith({
      title: 'Homepage hero',
      titleAr: 'بانر الواجهة',
      imageUrl: 'https://cdn.example.com/banner.jpg',
      imageUrlPortrait: null,
      imageUrlLandscape: 'https://cdn.example.com/banner.jpg',
      productId: 15,
      sortOrder: 4,
      active: true,
    });
    expect(selectMock).toHaveBeenCalledOnce();
    expect(resolveEntityId([{ id: 77 }])).toBe(77);
    expect(revalidateStorefrontAssetsMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('creates featured groups with the storefront top placement flag', async () => {
    hasDbMock.mockReturnValue(true);
    const selectFromMock = vi.fn().mockResolvedValue([{ value: 2 }]);
    const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });
    const db = { marker: 'db', select: selectMock };
    getDbMock.mockReturnValue(db);

    vi.spyOn(featuredProductGroupSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        name: 'Top carousel',
        nameAr: 'دوار علوي',
        cta: 'Voir Plus',
        ctaAr: 'اكتشف المزيد',
        link: '/products?featured=1',
        productIds: [9],
        brandIds: [],
        categoryIds: [],
        showAtTopOfProductsPage: true,
        active: true,
      },
    } as never);

    const req = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ kind: 'featuredGroup', data: {} }),
      headers: { 'content-type': 'application/json' },
    });

    await POST(req);

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const returningMock = vi.fn().mockResolvedValue([{ id: 77 }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
    const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

    await execute({ insert: insertMock, delete: deleteMock });

    expect(valuesMock).toHaveBeenCalledWith({
      name: 'Top carousel',
      nameAr: 'دوار علوي',
      cta: 'Voir Plus',
      ctaAr: 'اكتشف المزيد',
      link: '/products?featured=1',
      active: true,
      sortOrder: 2,
      showAtTopOfProductsPage: true,
    });
  });
});
