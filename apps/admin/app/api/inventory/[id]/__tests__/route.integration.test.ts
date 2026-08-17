import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '../route';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  mutateEntityWithHistoryMock,
  revalidateServerTagsMock,
  revalidateStorefrontProductsMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  revalidateServerTagsMock: vi.fn(),
  revalidateStorefrontProductsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

vi.mock('../../../../../lib/server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: revalidateServerTagsMock,
}));

vi.mock('../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: revalidateStorefrontProductsMock,
}));

describe('app/api/inventory/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    revalidateServerTagsMock.mockReset();
    revalidateStorefrontProductsMock.mockReset().mockResolvedValue(undefined);
    mutateEntityWithHistoryMock.mockResolvedValue([
      {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 5,
        barcode: '123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);
  });

  it('returns 400 when delta is zero', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/9', {
        method: 'PATCH',
        body: JSON.stringify({ delta: 0 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: expect.objectContaining({
        fieldErrors: expect.objectContaining({ delta: expect.any(Array) }),
      }),
    });
  });

  it('returns 400 before querying for a malformed product id', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/nope', {
        method: 'PATCH',
        body: JSON.stringify({ delta: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'nope' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid product id' });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the product does not exist', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: { products: { findFirst: vi.fn().mockResolvedValue(undefined) } },
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/9', {
        method: 'PATCH',
        body: JSON.stringify({ delta: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('records inventory adjustments through action history', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      marker: 'db',
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({
            id: 9,
            title: 'Hammer',
            inventoryQuantity: 4,
            inStock: false,
            availabilityStatus: 'out_of_stock',
          }),
        },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/9', {
        method: 'PATCH',
        body: JSON.stringify({ delta: -2 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'products',
        entityId: 9,
        operation: 'update',
        actor: { email: 'admin@example.com', name: 'Admin' },
        execute: expect.any(Function),
      }),
    );

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const returningMock = vi.fn().mockResolvedValue([
      {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 2,
        barcode: '123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });

    await execute({ update: updateMock });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryQuantity: 2,
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: expect.any(Date),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('products', 'products-meta');
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 5,
        barcode: '123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    });
  });

  it('updates inStock without changing inventory quantity', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      marker: 'db',
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({
            id: 9,
            title: 'Hammer',
            inventoryQuantity: 0,
            inStock: false,
            availabilityStatus: 'out_of_stock',
          }),
        },
      },
    };
    getDbMock.mockReturnValue(db);

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/9', {
        method: 'PATCH',
        body: JSON.stringify({ inStock: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const returningMock = vi.fn().mockResolvedValue([
      {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 0,
        barcode: '123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'out_of_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });

    await execute({ update: updateMock });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inStock: true,
        updatedAt: expect.any(Date),
      }),
    );
    expect(setMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryQuantity: expect.anything(),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
  });

  it('updates barcode without changing inventory quantity or stock', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      marker: 'db',
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({
            id: 9,
            title: 'Hammer',
            inventoryQuantity: 4,
            barcode: null,
            inStock: true,
            availabilityStatus: 'in_stock',
          }),
        },
      },
    };
    getDbMock.mockReturnValue(db);
    mutateEntityWithHistoryMock.mockResolvedValue([
      {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 4,
        barcode: 'NEW-123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);

    const res = await PATCH(
      new NextRequest('http://localhost/api/inventory/9', {
        method: 'PATCH',
        body: JSON.stringify({ barcode: ' NEW-123 ' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );

    const { execute } = mutateEntityWithHistoryMock.mock.calls[0][1];
    const returningMock = vi.fn().mockResolvedValue([
      {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 4,
        barcode: 'NEW-123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });

    await execute({ update: updateMock });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: 'NEW-123',
        updatedAt: expect.any(Date),
      }),
    );
    expect(setMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryQuantity: expect.anything(),
      }),
    );
    expect(setMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        inStock: expect.anything(),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidateStorefrontProductsMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: {
        id: 9,
        title: 'Hammer',
        inventoryQuantity: 4,
        barcode: 'NEW-123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    });
  });
});
