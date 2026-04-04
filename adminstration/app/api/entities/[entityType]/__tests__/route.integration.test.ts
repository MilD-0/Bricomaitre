import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const {
  authMock,
  canMutateResourceMock,
  hasDbMock,
  getDbMock,
  requireAppAccessMock,
  requireMutationAccessMock,
  mutateEntityWithHistoryMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canMutateResourceMock: vi.fn(),
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

  vi.mock('../../../../../lib/rbac', () => ({
    canMutateResource: canMutateResourceMock,
    getEntityMutationResource: (entityType: string) => {
      if (entityType === 'products') return 'products';
      if (entityType === 'orders') return 'orders';
      if (entityType === 'assets') return 'assets';
      if (entityType === 'brands' || entityType === 'categories' || entityType === 'brandsCategories') return 'brandsCategories';
      return null;
    },
    requireAppAccess: requireAppAccessMock,
    requireMutationAccess: requireMutationAccessMock,
  }));

describe('app/api/entities/[entityType]/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { permissions: ['products_write', 'orders_write', 'assets_write', 'brands_categories_write'], email: 'admin@example.com', name: 'Admin', isAllowed: true } });
    canMutateResourceMock.mockReset();
    canMutateResourceMock.mockReturnValue(true);
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireAppAccessMock.mockReset();
    requireAppAccessMock.mockResolvedValue(null);
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('returns fallback payload when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/entities/products'), {
      params: Promise.resolve({ entityType: 'products' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ writable: false, items: [] });
  });

  it('maps products and orders statuses to managed entity domain', async () => {
    hasDbMock.mockReturnValue(true);

    const rowsQueue = [
      [{ id: 1, title: 'In stock', updatedAt: new Date('2025-01-01T00:00:00.000Z'), inStock: true, sku: 'SKU-1' }],
      [{ id: 2, firstName: 'Jane', lastName: 'Doe', phoneNumber1: '0550', updatedAt: new Date('2025-01-02T00:00:00.000Z'), confirmed: 0 }],
    ];

    const orderByMock = vi.fn().mockImplementation(() => Promise.resolve(rowsQueue.shift()));
    const fromMock = vi.fn()
      .mockReturnValueOnce({ orderBy: orderByMock })
      .mockReturnValueOnce({ where: vi.fn(() => ({ orderBy: orderByMock })) });
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDbMock.mockReturnValue({ select: selectMock });

    const productsRes = await GET(new NextRequest('http://localhost/api/entities/products'), {
      params: Promise.resolve({ entityType: 'products' }),
    });
    const ordersRes = await GET(new NextRequest('http://localhost/api/entities/orders'), {
      params: Promise.resolve({ entityType: 'orders' }),
    });

    await expect(productsRes.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: '1',
          name: 'In stock',
          status: 'active',
          tags: ['SKU-1'],
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    await expect(ordersRes.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: '2',
          name: 'Jane Doe',
          status: 'draft',
          tags: ['0550'],
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns writable=false when the session lacks the matching resource permission', async () => {
    hasDbMock.mockReturnValue(true);
    canMutateResourceMock.mockReturnValue(false);

    const orderByMock = vi.fn().mockResolvedValue([]);
    const fromMock = vi.fn(() => ({ orderBy: orderByMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDbMock.mockReturnValue({ select: selectMock });

    const res = await GET(new NextRequest('http://localhost/api/entities/assets'), {
      params: Promise.resolve({ entityType: 'assets' }),
    });

    await expect(res.json()).resolves.toEqual({ writable: false, items: [] });
    expect(canMutateResourceMock).toHaveBeenCalledWith(
      ['products_write', 'orders_write', 'assets_write', 'brands_categories_write'],
      'assets',
    );
  });

  it('rejects read-only entity POST requests before touching the DB', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/entities/inventory', {
        method: 'POST',
        body: JSON.stringify({ name: 'Nope', status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'inventory' }) },
    );

    expect(requireMutationAccessMock).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Read only entity type' });
  });

  it('returns RBAC denial for entity writes', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await POST(
      new NextRequest('http://localhost/api/entities/orders', {
        method: 'POST',
        body: JSON.stringify({ name: '055011', status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders' }) },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 400 for invalid managed entity payloads', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await POST(
      new NextRequest('http://localhost/api/entities/orders', {
        method: 'POST',
        body: JSON.stringify({ name: 'ab', status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: expect.objectContaining({
        fieldErrors: expect.objectContaining({ name: expect.any(Array) }),
      }),
    });
  });

  it('creates order and records action history metadata', async () => {
    hasDbMock.mockReturnValue(true);

    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await POST(
      new NextRequest('http://localhost/api/entities/orders', {
        method: 'POST',
        body: JSON.stringify({ name: '055011', status: 'active', tags: 'fragile, express' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledOnce();
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'orders',
      operation: 'create',
      actor: { email: 'admin@example.com', name: 'Admin' },
      resolveEntityId: expect.any(Function),
      execute: expect.any(Function),
    }));
    expect(res.status).toBe(200);
  });

   it('returns 400 for unsupported entity type in GET', async () => {
     hasDbMock.mockReturnValue(true);
     const res = await GET(new NextRequest('http://localhost/api/entities/unknown'), {
       params: Promise.resolve({ entityType: 'unknown' }),
     });

     expect(res.status).toBe(400);
     await expect(res.json()).resolves.toEqual({ error: 'Unsupported entity type' });
   });

   it('handles GET for brands with images, status, and audit metadata', async () => {
     hasDbMock.mockReturnValue(true);
     const rows = [
       {
         id: 1,
         name: 'BrandA',
         createdAt: new Date('2024-12-30T00:00:00.000Z'),
         updatedAt: new Date('2025-01-01T00:00:00.000Z'),
         isActive: true,
         featured: true,
         image: 'https://example.com/branda.jpg',
         createdBy: 'creator@example.com',
         createdByName: 'Creator',
         updatedBy: 'editor@example.com',
         updatedByName: 'Editor',
       },
       {
         id: 2,
         name: 'BrandB',
         createdAt: new Date('2024-12-31T00:00:00.000Z'),
         updatedAt: new Date('2025-01-02T00:00:00.000Z'),
         isActive: false,
         featured: false,
         image: null,
         createdBy: null,
         createdByName: null,
         updatedBy: null,
         updatedByName: null,
       },
     ];
     const countWhereMock = vi.fn().mockResolvedValue([{ value: 2 }]);
     const offsetMock = vi.fn().mockResolvedValue(rows);
     const limitMock = vi.fn(() => ({ offset: offsetMock }));
     const orderByMock = vi.fn(() => ({ limit: limitMock }));
     const fromMock = vi
       .fn()
       .mockReturnValueOnce({ where: countWhereMock })
       .mockReturnValueOnce({ orderBy: orderByMock, where: vi.fn(() => ({ orderBy: orderByMock })) });
     const selectMock = vi.fn(() => ({ from: fromMock }));
     getDbMock.mockReturnValue({ select: selectMock });

     const res = await GET(new NextRequest('http://localhost/api/entities/brands?page=1&limit=50'), {
       params: Promise.resolve({ entityType: 'brands' }),
     });

      await expect(res.json()).resolves.toEqual({
        writable: true,
        items: [
          {
            id: '1',
            name: 'BrandA',
            isActive: true,
            status: 'active',
            image: 'https://example.com/branda.jpg',
            createdAt: '2024-12-30T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
            createdBy: 'creator@example.com',
            createdByName: 'Creator',
            updatedBy: 'editor@example.com',
            updatedByName: 'Editor',
          },
          {
            id: '2',
            name: 'BrandB',
            isActive: false,
            status: 'draft',
            image: null,
            createdAt: '2024-12-31T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            createdBy: null,
            createdByName: null,
            updatedBy: null,
            updatedByName: null,
          },
        ],
        pagination: { page: 1, limit: 50, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });
    });

    it('handles GET for categories with parent metadata and pagination', async () => {
      hasDbMock.mockReturnValue(true);
      const categoryRows = [
        {
          id: 1,
          name: 'CategoryA',
          nameAr: 'الفئة أ',
          createdAt: new Date('2024-12-30T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          isActive: true,
          featured: true,
          image: 'https://example.com/cata.jpg',
          parentId: 2,
          createdBy: 'creator@example.com',
          createdByName: 'Creator',
          updatedBy: 'editor@example.com',
          updatedByName: 'Editor',
        },
      ];
      const optionRows = [
        { id: 1, name: 'CategoryA' },
        { id: 2, name: 'ParentCategory' },
      ];
      const countWhereMock = vi.fn().mockResolvedValue([{ value: 1 }]);
      const pagedOrderByMock = vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn().mockResolvedValue(categoryRows),
        })),
      }));
      const parentWhereMock = vi.fn().mockResolvedValue([{ id: 2, name: 'ParentCategory' }]);
      const fromMock = vi
        .fn()
        .mockReturnValueOnce({ where: countWhereMock })
        .mockReturnValueOnce({ orderBy: pagedOrderByMock, where: vi.fn(() => ({ orderBy: pagedOrderByMock })) })
        .mockReturnValueOnce({ where: parentWhereMock });
      const selectMock = vi.fn(() => ({ from: fromMock }));
      getDbMock.mockReturnValue({ select: selectMock });

      const res = await GET(new NextRequest('http://localhost/api/entities/categories?page=1&limit=50'), {
        params: Promise.resolve({ entityType: 'categories' }),
      });

      await expect(res.json()).resolves.toEqual({
        writable: true,
        items: [
          {
            id: '1',
            name: 'CategoryA',
            nameAr: 'الفئة أ',
            image: 'https://example.com/cata.jpg',
            isActive: true,
            status: 'active',
            parentId: '2',
            parentName: 'ParentCategory',
            createdAt: '2024-12-30T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
            createdBy: 'creator@example.com',
            createdByName: 'Creator',
            updatedBy: 'editor@example.com',
            updatedByName: 'Editor',
          },
        ],
        parentOptions: [],
        pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });
    });

   it('creates brand with imageUrl', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await POST(
       new NextRequest('http://localhost/api/entities/brands', {
         method: 'POST',
         body: JSON.stringify({ name: 'NewBrand', imageUrl: 'https://example.com/new.jpg' }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'brands' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'brands',
       operation: 'create',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });

   it('creates category with imageUrl', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await POST(
       new NextRequest('http://localhost/api/entities/categories', {
         method: 'POST',
         body: JSON.stringify({ name: 'NewCat', nameAr: 'جديد', imageUrl: '', parentId: 1 }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'categories' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'categories',
       operation: 'create',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });
 });
