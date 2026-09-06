import { ActionHistoryEntityNotFoundError } from '../../../../../lib/action-history-state';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, PUT } from '../route';
import { ProductMutationNotFoundError } from '../../../../../lib/product-update-workflow';

const {
  hasDbMock,
  getDbMock,
  requireAppAccessMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  archiveProductMock,
  startProductCatalogFeedRefreshJobMock,
  revalidateStorefrontProductsMock,
  revalidateStorefrontLandingPagesMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  archiveProductMock: vi.fn(),
  startProductCatalogFeedRefreshJobMock: vi.fn(),
  revalidateStorefrontProductsMock: vi.fn(),
  revalidateStorefrontLandingPagesMock: vi.fn(),
}));
const { revalidateServerTagsMock, captureAdminExceptionMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
  captureAdminExceptionMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
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

vi.mock('../../../../../lib/action-history', async () => ({
  ActionHistoryEntityNotFoundError: (await import('../../../../../lib/action-history-state'))
    .ActionHistoryEntityNotFoundError,
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../../lib/product-update-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/product-update-workflow')>()),
  archiveProductThroughCanonicalWorkflow: archiveProductMock,
}));

vi.mock('../../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: startProductCatalogFeedRefreshJobMock,
}));

vi.mock('../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: revalidateStorefrontProductsMock,
  revalidateStorefrontLandingPages: revalidateStorefrontLandingPagesMock,
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
    archiveProductMock.mockReset();
    archiveProductMock.mockImplementation(async (_db, id) => ({ id, archived: true }));
    startProductCatalogFeedRefreshJobMock.mockReset();
    startProductCatalogFeedRefreshJobMock.mockResolvedValue({ kind: 'started', job: null });
    revalidateStorefrontProductsMock.mockReset();
    revalidateStorefrontProductsMock.mockResolvedValue(undefined);
    revalidateStorefrontLandingPagesMock.mockReset();
    revalidateStorefrontLandingPagesMock.mockResolvedValue(undefined);
    revalidateServerTagsMock.mockReset();
    captureAdminExceptionMock.mockReset();
  });

  it.each([[], ['products_write'], ['orders_write']] as string[][])(
    'limits purchase cost to an explicit operational permission: %j',
    async (...permissions) => {
      const allowed = permissions.flat();
      hasDbMock.mockReturnValue(true);
      authMock.mockResolvedValue({ user: { permissions: allowed } });
      getDbMock.mockReturnValue({
        query: {
          products: {
            findFirst: vi
              .fn()
              .mockResolvedValue({ id: 1, title: 'Visible product', purchasePrice: '700.00' }),
          },
        },
        select: () => ({ from: () => ({ where: async () => [] }) }),
      });
      const response = await GET(new NextRequest('http://localhost/api/products/1'), {
        params: Promise.resolve({ id: '1' }),
      });
      const { item } = await response.json();
      expect(response.status).toBe(200);
      expect(item.title).toBe('Visible product');
      if (allowed.length) expect(item.purchasePrice).toBe('700.00');
      else expect(item).not.toHaveProperty('purchasePrice');
    },
  );

  it('returns 404 for a missing PATCH target before refreshing consumers', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({});
    mutateEntityWithHistoryMock.mockRejectedValue(
      new ActionHistoryEntityNotFoundError('products', 999),
    );
    const response = await PATCH(
      new NextRequest('http://localhost/api/products/999', {
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      }),
      { params: Promise.resolve({ id: '999' }) },
    );
    expect(response.status).toBe(404);
    expect(revalidateStorefrontProductsMock).not.toHaveBeenCalled();
  });

  it('returns 503 when DB is unavailable for GET', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/products/1'), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 401 for GET when app access is denied', async () => {
    requireAppAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await GET(new NextRequest('http://localhost/api/products/1'), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for missing product in GET', async () => {
    hasDbMock.mockReturnValue(true);
    const findFirst = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({ query: { products: { findFirst } } });

    const res = await GET(new NextRequest('http://localhost/api/products/999'), {
      params: Promise.resolve({ id: '999' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });

  it.each([
    ['GET', (request: NextRequest) => GET(request, { params: Promise.resolve({ id: 'nope' }) })],
    ['PUT', (request: NextRequest) => PUT(request, { params: Promise.resolve({ id: 'nope' }) })],
    [
      'PATCH',
      (request: NextRequest) => PATCH(request, { params: Promise.resolve({ id: 'nope' }) }),
    ],
    [
      'DELETE',
      (request: NextRequest) => DELETE(request, { params: Promise.resolve({ id: 'nope' }) }),
    ],
  ])('returns 400 for a malformed product id in %s', async (method, callRoute) => {
    hasDbMock.mockReturnValue(true);
    const request = new NextRequest('http://localhost/api/products/nope', {
      method,
      ...(method === 'PUT' || method === 'PATCH'
        ? { body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }
        : {}),
    });

    const res = await callRoute(request);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid product id' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns 403 for PUT when caller lacks RBAC access', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

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

    const res = await PUT(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PUT',
        body: JSON.stringify({ bad: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { fieldErrors: { title: expect.any(Array), price: expect.any(Array) } },
    });
    expect(mutateEntityWithHistoryMock).not.toHaveBeenCalled();
  });

  it('updates product and applies numeric formatting rules in PUT', async () => {
    hasDbMock.mockReturnValue(true);
    const payload = {
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
      availabilityStatus: 'out_of_stock',
      inventoryQuantity: 3,
      brandId: null,
      categoryId: null,
      images: [],
      promoCodes: [],
    };

    const db = {
      marker: 'db',
      query: {
        products: { findFirst: vi.fn().mockResolvedValue(undefined) },
        productSlugHistory: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PUT(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PUT',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '4' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'products',
        entityId: 4,
        operation: 'update',
        actor: { email: 'admin@example.com', name: 'Admin' },
        execute: expect.any(Function),
      }),
    );

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });
    await execute(
      { query: db.query, update: updateMock, delete: deleteMock },
      { slug: 'updated-product' },
    );

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        price: '7.00',
        slug: 'updated-product',
        oldPrice: '8.20',
        purchasePrice: null,
        active: false,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        inventoryQuantity: 3,
        updatedAt: expect.any(Date),
      }),
    );
    expect(updateMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledOnce();
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith(
      'product:update',
      'request-2',
    );
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    expect(revalidateStorefrontLandingPagesMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('patches product toggles in PATCH', async () => {
    hasDbMock.mockReturnValue(true);
    const payload = {
      active: true,
      inStock: false,
      availabilityStatus: 'out_of_stock',
    };

    const db = {
      marker: 'db',
      query: {
        products: { findFirst: vi.fn().mockResolvedValue(undefined) },
        productSlugHistory: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PATCH(
      new NextRequest('http://localhost/api/products/4', {
        method: 'PATCH',
        body: JSON.stringify(payload),
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

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        updatedAt: expect.any(Date),
      }),
    );
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith(
      'product:patch',
      'request-2',
    );
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    expect(revalidateStorefrontLandingPagesMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('archives a product when RBAC allows it', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      marker: 'db',
      query: {
        products: { findFirst: vi.fn().mockResolvedValue(undefined) },
        productSlugHistory: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await DELETE(
      new NextRequest('http://localhost/api/products/4', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '4' }),
      },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(archiveProductMock).toHaveBeenCalledWith(db, 4, {
      email: 'admin@example.com',
      name: 'Admin',
    });
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith(
      'product:delete',
      'request-2',
    );
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    expect(revalidateStorefrontLandingPagesMock).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, archived: true });
  });

  it('does not fail product deletion when feed enqueue fails', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      marker: 'db',
      query: {
        products: { findFirst: vi.fn().mockResolvedValue(undefined) },
        productSlugHistory: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };
    getDbMock.mockReturnValue(db);
    startProductCatalogFeedRefreshJobMock.mockRejectedValue(new Error('queue unavailable'));

    const res = await DELETE(
      new NextRequest('http://localhost/api/products/4', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '4' }),
      },
    );

    expect(res.status).toBe(200);
    expect(captureAdminExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'product-catalog-feed-enqueue',
        context: { trigger: 'product:delete', productId: 4 },
      }),
    );
  });

  it('returns 404 when the archive target no longer exists', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      marker: 'db',
      query: {
        products: { findFirst: vi.fn().mockResolvedValue(undefined) },
        productSlugHistory: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    });
    archiveProductMock.mockRejectedValue(new ProductMutationNotFoundError(404));

    const res = await DELETE(
      new NextRequest('http://localhost/api/products/404', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '404' }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
    expect(startProductCatalogFeedRefreshJobMock).not.toHaveBeenCalled();
  });
});
