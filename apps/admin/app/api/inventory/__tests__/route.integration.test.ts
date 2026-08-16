import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { hasDbMock, getDbMock, requireMutationAccessMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

describe('app/api/inventory/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
  });

  it('returns RBAC denial when caller cannot access inventory', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await GET(new NextRequest('http://localhost/api/inventory'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns an empty paginated payload when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/inventory?page=2&limit=25'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      writable: false,
      items: [],
      pagination: {
        page: 2,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it('returns 400 for malformed pagination queries', async () => {
    const res = await GET(new NextRequest('http://localhost/api/inventory?limit=51'));

    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
    expect(hasDbMock).not.toHaveBeenCalled();
  });

  it('returns paginated in-stock inventory rows in the default inventory view', async () => {
    hasDbMock.mockReturnValue(true);
    const countWhereMock = vi.fn().mockResolvedValue([{ value: 3 }]);
    const offsetMock = vi.fn().mockResolvedValue([
      {
        id: 2,
        title: 'Drill',
        inventoryQuantity: 8,
        barcode: '456',
        sku: 'DRI-2',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-22T00:00:00.000Z'),
      },
      {
        id: 1,
        title: 'Hammer',
        inventoryQuantity: 5,
        barcode: '123',
        sku: 'HAM-1',
        inStock: true,
        availabilityStatus: 'in_stock',
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      },
    ]);
    const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi
      .fn()
      .mockReturnValueOnce({ where: countWhereMock })
      .mockReturnValueOnce({ where: whereMock });
    getDbMock.mockReturnValue({ select: vi.fn(() => ({ from: fromMock })) });

    const res = await GET(new NextRequest('http://localhost/api/inventory?page=2&limit=2'));

    expect(res.status).toBe(200);
    expect(whereMock).toHaveBeenCalledOnce();
    expect(limitMock).toHaveBeenCalledWith(2);
    expect(offsetMock).toHaveBeenCalledWith(2);
    await expect(res.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: 2,
          title: 'Drill',
          inventoryQuantity: 8,
          barcode: '456',
          sku: 'DRI-2',
          inStock: true,
          availabilityStatus: 'in_stock',
          updatedAt: '2026-03-22T00:00:00.000Z',
        },
        {
          id: 1,
          title: 'Hammer',
          inventoryQuantity: 5,
          barcode: '123',
          sku: 'HAM-1',
          inStock: true,
          availabilityStatus: 'in_stock',
          updatedAt: '2026-03-21T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 2,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it('returns searched products even when their inventory quantity is zero', async () => {
    hasDbMock.mockReturnValue(true);
    const countWhereMock = vi.fn().mockResolvedValue([{ value: 1 }]);
    const offsetMock = vi.fn().mockResolvedValue([
      {
        id: 7,
        title: 'Wrench',
        inventoryQuantity: 0,
        barcode: '777',
        sku: 'WRE-7',
        inStock: false,
        availabilityStatus: 'out_of_stock',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
      },
    ]);
    const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi
      .fn()
      .mockReturnValueOnce({ where: countWhereMock })
      .mockReturnValueOnce({ where: whereMock });
    getDbMock.mockReturnValue({ select: vi.fn(() => ({ from: fromMock })) });

    const res = await GET(new NextRequest('http://localhost/api/inventory?search=wre'));

    expect(res.status).toBe(200);
    expect(whereMock).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: 7,
          title: 'Wrench',
          inventoryQuantity: 0,
          barcode: '777',
          sku: 'WRE-7',
          inStock: false,
          availabilityStatus: 'out_of_stock',
          updatedAt: '2026-03-23T00:00:00.000Z',
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
});
