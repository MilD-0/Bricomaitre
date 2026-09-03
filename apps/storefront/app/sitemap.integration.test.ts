import { beforeEach, describe, expect, it, vi } from 'vitest';

import sitemap from './sitemap';

const mocks = vi.hoisted(() => ({ products: vi.fn() }));
vi.mock('@/lib/storefront-api', () => ({ getStorefrontSitemapProducts: mocks.products }));

describe('sitemap route', () => {
  beforeEach(() => {
    mocks.products.mockReset();
  });

  it('uses the canonical catalog source for active product URLs', async () => {
    mocks.products.mockResolvedValue([
      {
        id: 12,
        slug: 'desk-lamp',
        mongoId: null,
        title: 'Desk lamp',
        titleAr: null,
        description: null,
        descriptionAr: null,
        sku: null,
        barcode: null,
        price: '1500.00',
        oldPrice: null,
        inStock: true,
        availabilityStatus: 'in_stock',
        brandId: null,
        categoryId: null,
        images: [],
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-02T10:00:00.000Z',
      },
    ]);

    await expect(sitemap()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://bricomaitre.com/fr/products/desk-lamp' }),
        expect.objectContaining({ url: 'https://bricomaitre.com/ar/products/desk-lamp' }),
      ]),
    );
  });

  it('still exposes homepage and catalog discovery when the API is unavailable', async () => {
    mocks.products.mockRejectedValue(new Error('unavailable'));
    const entries = await sitemap();

    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://bricomaitre.com/fr',
      'https://bricomaitre.com/fr/products',
      'https://bricomaitre.com/ar',
      'https://bricomaitre.com/ar/products',
    ]);
  });
});
