import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';
import { productPayloadSchema } from '../../../../lib/products';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  startProductCatalogFeedRefreshJobMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  startProductCatalogFeedRefreshJobMock: vi.fn(),
}));
const { revalidateServerTagsMock, captureAdminExceptionMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
  captureAdminExceptionMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
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

vi.mock('../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: startProductCatalogFeedRefreshJobMock,
}));

vi.mock('../../../../lib/server-cache', () => ({
  CACHE_TAGS: {
    products: 'products',
    productsMeta: 'products-meta',
  },
  applyServerCache: vi.fn(),
  revalidateServerTags: revalidateServerTagsMock,
}));

vi.mock('../../../../lib/sentry', () => ({
  getRequestId: vi.fn(() => 'request-1'),
  captureAdminException: captureAdminExceptionMock,
}));

describe('app/api/products/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
    startProductCatalogFeedRefreshJobMock.mockReset();
    startProductCatalogFeedRefreshJobMock.mockResolvedValue({ kind: 'started', job: null });
    revalidateServerTagsMock.mockReset();
    captureAdminExceptionMock.mockReset();
  });

  it('returns 401 when the caller is not authorized to mutate products', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns an empty list when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/products'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [] });
  });

  it('returns every product row ordered by most recently updated', async () => {
    hasDbMock.mockReturnValue(true);

    const rows = [
      {
        id: 1,
        title: 'Newest',
        updatedAt: new Date('2026-03-05T00:00:00.000Z'),
      },
      {
        id: 2,
        title: 'Older',
        updatedAt: new Date('2026-03-04T00:00:00.000Z'),
      },
    ];

    const orderByMock = vi.fn().mockResolvedValue(rows);
    const fromMock = vi.fn(() => ({ orderBy: orderByMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDbMock.mockReturnValue({ select: selectMock });

    const res = await GET(new NextRequest('http://localhost/api/products'));

    expect(orderByMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 1,
          title: 'Newest',
          updatedAt: '2026-03-05T00:00:00.000Z',
        },
        {
          id: 2,
          title: 'Older',
          updatedAt: '2026-03-04T00:00:00.000Z',
        },
      ],
    });
  });

  it('treats imageOrigin as a paginated products filter', async () => {
    hasDbMock.mockReturnValue(true);

    const rows = [
      {
        id: 3,
        title: 'External image product',
        updatedAt: new Date('2026-03-06T00:00:00.000Z'),
      },
    ];

    const offsetMock = vi.fn().mockResolvedValue(rows);
    const limitMock = vi.fn(() => ({ offset: offsetMock }));
    const orderByMock = vi.fn(() => ({ limit: limitMock }));
    const whereRowsMock = vi.fn(() => ({ orderBy: orderByMock }));
    const fromRowsMock = vi.fn(() => ({ where: whereRowsMock }));
    const whereCountMock = vi.fn().mockResolvedValue([{ value: 1 }]);
    const fromCountMock = vi.fn(() => ({ where: whereCountMock }));
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: fromCountMock })
      .mockReturnValueOnce({ from: fromRowsMock });

    getDbMock.mockReturnValue({ select: selectMock });

    const res = await GET(new NextRequest('http://localhost/api/products?page=1&limit=50&imageOrigin=external'));

    expect(whereCountMock).toHaveBeenCalledOnce();
    expect(whereRowsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 3,
          title: 'External image product',
          updatedAt: '2026-03-06T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 400 for invalid payload from schema safeParse', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(productPayloadSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ formErrors: ['invalid'] }) },
    } as never);

    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ bad: true }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: { formErrors: ['invalid'] } });
  });

  it('creates product and applies numeric formatting rules', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    vi.spyOn(productPayloadSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Test Product',
        slug: 'test-product',
        titleAr: null,
        description: null,
        descriptionAr: null,
        sku: 'SKU-1',
        barcode: null,
        price: 12.3,
        oldPrice: 14,
        purchasePrice: 9.5,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 8,
        brandId: null,
        categoryId: null,
        images: [],
      },
    } as never);

    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(res.status).toBe(200);
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'products',
      operation: 'create',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: expect.any(Function),
      resolveEntityId: expect.any(Function),
    }));

    const { execute, resolveEntityId } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const valuesMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 55 }]) });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    await execute({ insert: insertMock });

    expect(insertMock).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      price: '12.30',
      slug: 'test-product',
      oldPrice: '14.00',
      purchasePrice: '9.50',
      active: true,
      inventoryQuantity: 8,
    }));
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith('product:create', 'request-1');
    expect(resolveEntityId([{ id: 55 }])).toBe(55);
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('does not fail product creation when feed enqueue fails', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);
    startProductCatalogFeedRefreshJobMock.mockRejectedValue(new Error('queue unavailable'));

    vi.spyOn(productPayloadSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        title: 'Test Product',
        slug: 'test-product',
        titleAr: null,
        description: null,
        descriptionAr: null,
        sku: null,
        barcode: null,
        price: 1,
        oldPrice: null,
        purchasePrice: null,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 0,
        brandId: null,
        categoryId: null,
        images: [],
      },
    } as never);

    const res = await POST(new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(200);
    expect(captureAdminExceptionMock).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      operation: 'product-catalog-feed-enqueue',
      context: { trigger: 'product:create' },
    }));
  });
});
