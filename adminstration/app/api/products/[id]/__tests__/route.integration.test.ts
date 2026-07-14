import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, PUT } from '../route';
import { productPatchSchema, productPayloadSchema } from '../../../../../lib/products';

const {
  hasDbMock,
  getDbMock,
  requireAppAccessMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  startProductCatalogFeedRefreshJobMock,
  revalidateStorefrontProductsMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  startProductCatalogFeedRefreshJobMock: vi.fn(),
  revalidateStorefrontProductsMock: vi.fn(),
}));
const { revalidateServerTagsMock, captureAdminExceptionMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
  captureAdminExceptionMock: vi.fn(),
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireAppAccess: requireAppAccessMock,
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: startProductCatalogFeedRefreshJobMock,
}));

vi.mock('../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: revalidateStorefrontProductsMock,
}));

vi.mock('../../../../../lib/server-cache', () => ({
  CACHE_TAGS: {
    products: 'products',
    productsMeta: 'products-meta',
  },
  revalidateServerTags: revalidateServerTagsMock,
}));

vi.mock('../../../../../lib/sentry', () => ({
  getRequestId: vi.fn(() => 'request-2'),
  captureAdminException: captureAdminExceptionMock,
}));

describe('app/api/products/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireAppAccessMock.mockReset();
    requireAppAccessMock.mockResolvedValue(null);
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
    startProductCatalogFeedRefreshJobMock.mockReset();
    startProductCatalogFeedRefreshJobMock.mockResolvedValue({ kind: 'started', job: null });
    revalidateStorefrontProductsMock.mockReset();
    revalidateStorefrontProductsMock.mockResolvedValue(undefined);
    revalidateServerTagsMock.mockReset();
    captureAdminExceptionMock.mockReset();
  });

  it('returns 503 when DB is unavailable for GET', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/products/1'), { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 401 for GET when app access is denied', async () => {
    requireAppAccessMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await GET(new NextRequest('http://localhost/api/products/1'), { params: Promise.resolve({ id: '1' }) });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for missing product in GET', async () => {
    hasDbMock.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({ query: { products: { findFirst } } });

    const res = await GET(new NextRequest('http://localhost/api/products/999'), { params: Promise.resolve({ id: '999' }) });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('returns 403 for PUT when caller lacks RBAC access', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await PUT(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when PUT payload is invalid', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(productPayloadSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { title: ['required'] } }) },
    } as never);

    const res = await PUT(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PUT',
        body: JSON.stringify({ bad: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: { fieldErrors: { title: ['required'] } } });
  });

  it('updates product and applies numeric formatting rules in PUT', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(productPayloadSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Updated Product',
        slug: 'updated-product',
        titleAr: null,
        description: null,
        descriptionAr: null,
        sku: null,
        barcode: null,
        price: 7,
        oldPrice: 8.2,
        purchasePrice: null,
        active: false,
        inStock: false,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 3,
        brandId: null,
        categoryId: null,
        images: [],
      },
    } as never);

    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await PUT(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'products',
      entityId: 4,
      operation: 'update',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: expect.any(Function),
    }));

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    await execute({ update: updateMock });

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      price: '7.00',
      slug: 'updated-product',
      oldPrice: '8.20',
      purchasePrice: null,
      active: false,
      inventoryQuantity: 3,
      updatedAt: expect.any(Date),
    }));
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith('product:update', 'request-2');
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('patches product toggles in PATCH', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(productPatchSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        active: true,
        inStock: false,
      },
    } as never);

    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await PATCH(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PATCH',
        body: JSON.stringify({ active: true, inStock: false }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(res.status).toBe(200);

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    await execute({ update: updateMock });

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      active: true,
      inStock: false,
      updatedAt: expect.any(Date),
    }));
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith('product:patch', 'request-2');
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('deletes a product when RBAC allows it', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await DELETE(new NextRequest('http://localhost/api/products/4', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '4' }),
    });

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'products',
      entityId: 4,
      operation: 'delete',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: expect.any(Function),
    }));

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ where: whereMock });
    await execute({ delete: deleteMock });

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith('product:delete', 'request-2');
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('does not fail product deletion when feed enqueue fails', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);
    startProductCatalogFeedRefreshJobMock.mockRejectedValue(new Error('queue unavailable'));

    const res = await DELETE(new NextRequest('http://localhost/api/products/4', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '4' }),
    });

    expect(res.status).toBe(200);
    expect(captureAdminExceptionMock).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      operation: 'product-catalog-feed-enqueue',
      context: { trigger: 'product:delete', productId: 4 },
    }));
  });
});
