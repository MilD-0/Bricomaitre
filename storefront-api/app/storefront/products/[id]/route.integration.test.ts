import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontProductByTokenMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontProductByTokenMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontProductByToken: readStorefrontProductByTokenMock,
}));

const productResponse = {
  item: {
    id: 12,
    canonicalToken: 'desk-lamp',
    title: 'Desk Lamp',
    titleAr: 'مصباح مكتب',
    description: 'Warm light',
    descriptionAr: null,
    sku: 'DL-1',
    barcode: null,
    price: '1500.00',
    oldPrice: null,
    availability: {
      status: 'in_stock',
      inStock: true,
      quantity: 4,
    },
    media: [{
      url: 'https://cdn.example.com/lamp.jpg',
      position: 0,
      width: null,
      height: null,
      blurDataUrl: null,
    }],
    brand: { id: 2, name: 'Bric', slug: 'bric', image: null },
    category: {
      id: 3,
      name: 'Lighting',
      nameAr: 'إضاءة',
      slug: 'lighting',
      image: null,
      parentId: null,
      properties: [],
    },
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  resolution: {
    requestedToken: 'legacy-lamp',
    matchedBy: 'mongoId',
    canonicalToken: 'desk-lamp',
  },
};

describe('app/storefront/products/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontProductByTokenMock.mockReset();
  });

  it('returns a validated product detail response for a legacy token', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductByTokenMock.mockResolvedValue(productResponse);

    const response = await GET(
      new NextRequest('http://localhost/storefront/products/legacy-lamp'),
      { params: Promise.resolve({ id: 'legacy-lamp' }) },
    );

    expect(response.status).toBe(200);
    expect(readStorefrontProductByTokenMock).toHaveBeenCalledWith({ tag: 'db' }, 'legacy-lamp');
    await expect(response.json()).resolves.toEqual(productResponse);
  });

  it('rejects invalid product tokens without querying dependencies', async () => {
    const response = await GET(
      new NextRequest('http://localhost/storefront/products/invalid'),
      { params: Promise.resolve({ id: ' '.repeat(3) }) },
    );

    expect(response.status).toBe(400);
    expect(hasDbMock).not.toHaveBeenCalled();
    expect(readStorefrontProductByTokenMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'Invalid product token.' });
  });

  it('returns a controlled unavailable response when the database is absent', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET(
      new NextRequest('http://localhost/storefront/products/desk-lamp'),
      { params: Promise.resolve({ id: 'desk-lamp' }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Storefront database is unavailable.' });
  });

  it('distinguishes a missing product from an upstream failure', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductByTokenMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/storefront/products/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Product not found.' });
  });
});
