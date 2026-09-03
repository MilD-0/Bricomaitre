import { describe, expect, it } from 'vitest';

import {
  buildCatalogMetadata,
  buildCatalogStructuredData,
  buildTaxonomyCatalogMetadata,
  buildTaxonomyUnavailableMetadata,
} from './catalog-seo';

describe('catalog SEO', () => {
  it('indexes the canonical catalog while keeping filtered combinations out of the index', () => {
    expect(buildCatalogMetadata('fr', false)).toMatchObject({
      alternates: { canonical: 'https://bricomaitre.com/fr/products' },
      robots: { index: true, follow: true },
      openGraph: {
        alternateLocale: ['ar_DZ'],
        images: [expect.objectContaining({ url: '/icons/icon-512.png' })],
      },
      twitter: { card: 'summary', images: ['/icons/icon-512.png'] },
    });
    expect(buildCatalogMetadata('ar', true)).toMatchObject({
      robots: { index: false, follow: true },
    });
  });

  it('builds localized ItemList entries with stable product tokens', () => {
    const data = buildCatalogStructuredData(
      [
        {
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
          inStock: true,
          availabilityStatus: 'in_stock',
          brandId: null,
          categoryId: null,
          images: [],
          createdAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-02T10:00:00.000Z',
        },
      ],
      'ar',
    );

    expect(data.itemListElement[0]).toMatchObject({
      position: 1,
      name: 'مصباح',
      url: 'https://bricomaitre.com/ar/products/desk-lamp',
    });
    expect(buildCatalogStructuredData([], 'fr', 'Éclairage')).toMatchObject({ name: 'Éclairage' });
  });

  it('gives canonical taxonomy landing pages their own indexable metadata', () => {
    expect(
      buildTaxonomyCatalogMetadata({
        locale: 'fr',
        kind: 'category',
        name: 'Éclairage',
        slug: 'eclairage',
      }),
    ).toMatchObject({
      alternates: { canonical: 'https://bricomaitre.com/fr/categories/eclairage' },
      robots: { index: true, follow: true },
      openGraph: { url: 'https://bricomaitre.com/fr/categories/eclairage' },
    });
    expect(
      buildTaxonomyCatalogMetadata({
        locale: 'fr',
        kind: 'brand',
        name: 'Wadfow',
        slug: 'wadfow',
        filtered: true,
      }),
    ).toMatchObject({ robots: { index: false, follow: true } });
    expect(buildTaxonomyUnavailableMetadata('fr')).toMatchObject({
      robots: { index: false, follow: true },
    });
  });
});
