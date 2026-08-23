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
  createProductMock,
  startProductCatalogFeedRefreshJobMock,
  revalidateStorefrontProductsMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  createProductMock: vi.fn(),
  startProductCatalogFeedRefreshJobMock: vi.fn(),
  revalidateStorefrontProductsMock: vi.fn(),
}));
const { revalidateServerTagsMock, captureAdminExceptionMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
  captureAdminExceptionMock: vi.fn(),
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

vi.mock('../../../../lib/product-update-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/product-update-workflow')>()),
  createProductThroughCanonicalWorkflow: createProductMock,
}));

vi.mock('../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: startProductCatalogFeedRefreshJobMock,
}));

vi.mock('../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: revalidateStorefrontProductsMock,
}));

vi.mock('../../../../lib/server-cache', () => ({
  CACHE_TAGS: {
    products: 'products',
    productsMeta: 'products-meta',
  },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
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
    createProductMock.mockReset();
    createProductMock.mockResolvedValue({ id: 55, slug: 'test-product' });
    startProductCatalogFeedRefreshJobMock.mockReset();
    startProductCatalogFeedRefreshJobMock.mockResolvedValue({ kind: 'started', job: null });
    revalidateStorefrontProductsMock.mockReset();
    revalidateStorefrontProductsMock.mockResolvedValue(undefined);
    revalidateServerTagsMock.mockReset();
    captureAdminExceptionMock.mockReset();
  });

  it('returns 401 when the caller is not authorized to mutate products', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

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

  it('returns 400 for malformed paginated queries', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await GET(new NextRequest('http://localhost/api/products?page=0'));
    const invalidStateRes = await GET(
      new NextRequest('http://localhost/api/products?page=1&state=archived'),
    );

    expect(res.status).toBe(400);
    expect(invalidStateRes.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
    expect(await invalidStateRes.json()).toHaveProperty('error');
    expect(getDbMock).not.toHaveBeenCalled();
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
    const fromMock = vi.fn(() => ({
      where: vi.fn(() => ({ orderBy: orderByMock })),
    }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDbMock.mockReturnValue({ select: selectMock, execute: vi.fn() });

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
    const executeMock = vi.fn().mockResolvedValue({ rows: [] });
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: fromCountMock })
      .mockReturnValueOnce({ from: fromRowsMock });

    getDbMock.mockReturnValue({ select: selectMock, execute: executeMock });

    const res = await GET(
      new NextRequest('http://localhost/api/products?page=1&limit=50&imageOrigin=external'),
    );

    expect(whereCountMock).toHaveBeenCalledOnce();
    expect(whereRowsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 3,
          title: 'External image product',
          updatedAt: '2026-03-06T00:00:00.000Z',
          orderPurchaseCount: 0,
          confirmedOrderCount: 0,
          confirmationRate: null,
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

  it('adds paginated product order metrics with one aggregate query', async () => {
    hasDbMock.mockReturnValue(true);

    const rows = [
      {
        id: 1,
        mongoId: 'f00000000000000000000005',
        title: 'Metric product',
        updatedAt: new Date('2026-03-06T00:00:00.000Z'),
      },
      {
        id: 2,
        mongoId: null,
        title: 'No orders product',
        updatedAt: new Date('2026-03-05T00:00:00.000Z'),
      },
    ];

    const offsetMock = vi.fn().mockResolvedValue(rows);
    const limitMock = vi.fn(() => ({ offset: offsetMock }));
    const orderByMock = vi.fn(() => ({ limit: limitMock }));
    const whereRowsMock = vi.fn(() => ({ orderBy: orderByMock }));
    const fromRowsMock = vi.fn(() => ({ where: whereRowsMock }));
    const whereCountMock = vi.fn().mockResolvedValue([{ value: 2 }]);
    const fromCountMock = vi.fn(() => ({ where: whereCountMock }));
    const executeMock = vi.fn().mockResolvedValue({
      rows: [
        {
          productId: 1,
          orderPurchaseCount: 12,
          confirmedOrderCount: 9,
        },
      ],
    });
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: fromCountMock })
      .mockReturnValueOnce({ from: fromRowsMock });

    getDbMock.mockReturnValue({ select: selectMock, execute: executeMock });

    const res = await GET(new NextRequest('http://localhost/api/products?page=1&limit=50'));

    expect(executeMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 1,
          mongoId: 'f00000000000000000000005',
          title: 'Metric product',
          updatedAt: '2026-03-06T00:00:00.000Z',
          orderPurchaseCount: 12,
          confirmedOrderCount: 9,
          confirmationRate: 75,
        },
        {
          id: 2,
          mongoId: null,
          title: 'No orders product',
          updatedAt: '2026-03-05T00:00:00.000Z',
          orderPurchaseCount: 0,
          confirmedOrderCount: 0,
          confirmationRate: null,
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 2,
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

  it('creates a product through the canonical lifecycle workflow', async () => {
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
    expect(createProductMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        title: 'Test Product',
        price: 12.3,
        purchasePrice: 9.5,
        inventoryQuantity: 8,
      }),
      { email: 'admin@example.com', name: 'Admin' },
    );
    expect(startProductCatalogFeedRefreshJobMock).toHaveBeenCalledWith(
      'product:create',
      'request-1',
    );
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
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

    const res = await POST(
      new NextRequest('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(captureAdminExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'product-catalog-feed-enqueue',
        context: { trigger: 'product:create' },
      }),
    );
  });
});
