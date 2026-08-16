import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { hasDbMock, getDbMock, requireMutationAccessMock, loadOrderDetailMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  loadOrderDetailMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/admin-orders-data', () => ({
  loadOrderDetail: loadOrderDetailMock,
}));

describe('app/api/inventory/scan/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    loadOrderDetailMock.mockReset();

    requireMutationAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValue(true);
  });

  it('returns a scanned order preview before barcode fallback for exact numeric input', async () => {
    loadOrderDetailMock.mockResolvedValue({
      id: 42,
      fullName: 'Ada Lovelace',
      orderProducts: [
        { productId: 7, title: 'Hammer', quantity: 2 },
        { productId: null, title: 'Custom bundle', quantity: 1 },
      ],
    });
    getDbMock.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ id: 7, inventoryQuantity: 5 }]),
        })),
      })),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/scan', {
        method: 'POST',
        body: JSON.stringify({ query: '42' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      kind: 'order',
      order: { id: 42, fullName: 'Ada Lovelace' },
      items: [
        { productId: 7, title: 'Hammer', quantity: 2, inventoryQuantity: 5, selectable: true },
        {
          productId: null,
          title: 'Custom bundle',
          quantity: 1,
          inventoryQuantity: null,
          selectable: false,
          reason: 'Missing catalog match.',
        },
      ],
    });
  });

  it('falls back to exact barcode lookup when no order exists', async () => {
    loadOrderDetailMock.mockResolvedValue(null);
    const limitMock = vi.fn().mockResolvedValue([
      {
        id: 3,
        title: 'Wrench',
        sku: 'WRE-3',
        barcode: '123',
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 4,
        updatedAt: new Date('2026-04-08T00:00:00.000Z'),
      },
    ]);
    getDbMock.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: limitMock,
          })),
        })),
      })),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/scan', {
        method: 'POST',
        body: JSON.stringify({ query: '123' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      kind: 'barcode',
      item: {
        id: 3,
        title: 'Wrench',
        sku: 'WRE-3',
        barcode: '123',
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 4,
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
    });
  });

  it('returns none when neither an order nor barcode match exists', async () => {
    loadOrderDetailMock.mockResolvedValue(null);
    const limitMock = vi.fn().mockResolvedValue([]);
    getDbMock.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: limitMock,
          })),
        })),
      })),
    });

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/scan', {
        method: 'POST',
        body: JSON.stringify({ query: 'MISSING' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ kind: 'none' });
  });

  it('returns RBAC denial when access is forbidden', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/scan', {
        method: 'POST',
        body: JSON.stringify({ query: '123' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(403);
  });
});
