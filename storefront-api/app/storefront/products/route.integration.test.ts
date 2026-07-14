import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontProductsMock, countStorefrontProductsMock, applyServerCacheMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontProductsMock: vi.fn(),
  countStorefrontProductsMock: vi.fn(),
  applyServerCacheMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontProducts: readStorefrontProductsMock,
  countStorefrontProducts: countStorefrontProductsMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    products: 'products',
  },
  applyServerCache: applyServerCacheMock,
}));

describe('app/storefront/products/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontProductsMock.mockReset();
    countStorefrontProductsMock.mockReset();
    applyServerCacheMock.mockReset();
  });

  it('returns an empty list when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/storefront/products'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [], total: 0 });
  });

  it('returns active storefront products with serialized timestamps', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductsMock.mockResolvedValue([
      {
        id: 1,
        slug: 'desk-lamp',
        title: 'Desk Lamp',
        titleAr: null,
        description: 'Warm light',
        descriptionAr: null,
        sku: 'DL-1',
        barcode: '123',
        price: '1500.00',
        oldPrice: null,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 5,
        brandId: 2,
        categoryId: 3,
        images: ['https://cdn.example.com/lamp.jpg'],
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    ]);
    countStorefrontProductsMock.mockResolvedValue(37);

    const res = await GET(new NextRequest('http://localhost/storefront/products?search=lamp'));

    expect(applyServerCacheMock).toHaveBeenCalledWith({ stale: 60, revalidate: 300, expire: 3600 }, 'products');
    expect(readStorefrontProductsMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ search: 'lamp' }),
    );
    expect(countStorefrontProductsMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ search: 'lamp' }),
    );
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 1,
          slug: 'desk-lamp',
          title: 'Desk Lamp',
          titleAr: null,
          description: 'Warm light',
          descriptionAr: null,
          sku: 'DL-1',
          barcode: '123',
          price: '1500.00',
          oldPrice: null,
          active: true,
          inStock: true,
          availabilityStatus: 'in_stock',
          inventoryQuantity: 5,
          brandId: 2,
          categoryId: 3,
          images: ['https://cdn.example.com/lamp.jpg'],
          createdAt: '2026-04-01T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
      ],
      total: 37,
    });
  });

  it('passes id lookups through to the catalog reader', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductsMock.mockResolvedValue([]);
    countStorefrontProductsMock.mockResolvedValue(0);

    const res = await GET(new NextRequest('http://localhost/storefront/products?id=42'));

    expect(res.status).toBe(200);
    expect(readStorefrontProductsMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ id: 42 }),
    );
    await expect(res.json()).resolves.toEqual({ items: [], total: 0 });
  });
});
