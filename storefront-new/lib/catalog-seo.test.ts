import { describe, expect, it } from 'vitest';

import { buildCatalogMetadata, buildCatalogStructuredData } from './catalog-seo';

describe('catalog SEO', () => {
  it('indexes the canonical catalog while keeping filtered combinations out of the index', () => {
    expect(buildCatalogMetadata('fr', false)).toMatchObject({
      alternates: { canonical: 'https://bricomaitre.com/fr/products' },
      robots: { index: true, follow: true },
    });
    expect(buildCatalogMetadata('ar', true)).toMatchObject({ robots: { index: false, follow: true } });
  });

  it('builds localized ItemList entries with stable product tokens', () => {
    const data = buildCatalogStructuredData([{
      id: 12,
      slug: 'desk-lamp',
      mongoId: null,
      title: 'Desk Lamp',
      titleAr: 'مصباح',
      description: null,
      descriptionAr: null,
      sku: null,
      barcode: null,
      price: '1500.00',
      oldPrice: null,
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      inventoryQuantity: 2,
      brandId: null,
      categoryId: null,
      images: [],
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
    }], 'ar');

    expect(data.itemListElement[0]).toMatchObject({
      position: 1,
      name: 'مصباح',
      url: 'https://bricomaitre.com/ar/products/desk-lamp',
    });
  });
});
