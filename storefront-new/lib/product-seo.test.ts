import { describe, expect, it } from 'vitest';

import {
  buildMissingProductMetadata,
  buildProductMetadata,
  buildProductStructuredData,
  getProductPath,
  serializeStructuredData,
} from './product-seo';

const product = {
  id: 12,
  canonicalToken: 'desk lamp',
  title: 'Desk Lamp',
  titleAr: 'مصباح مكتب',
  description: 'Warm light for the workshop.',
  descriptionAr: 'إضاءة دافئة للورشة.',
  sku: 'DL-1',
  barcode: null,
  price: '1500.00',
  oldPrice: null,
  availability: { status: 'in_stock', inStock: true, quantity: 4 },
  media: [{ url: 'https://cdn.example.com/lamp.jpg', position: 0, width: 900, height: 900, blurDataUrl: null }],
  brand: { id: 2, name: 'Bric', slug: 'bric', image: null },
  category: { id: 3, name: 'Lighting', nameAr: 'إضاءة', slug: 'lighting', image: null, parentId: null, properties: [] },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

describe('Product Detail SEO', () => {
  it('builds encoded localized canonicals, alternates, and social metadata', () => {
    const metadata = buildProductMetadata(product, 'ar');

    expect(getProductPath('ar', 'desk lamp')).toBe('/ar/products/desk%20lamp');
    expect(metadata).toMatchObject({
      title: 'مصباح مكتب',
      alternates: {
        canonical: 'https://bricomaitre.com/ar/products/desk%20lamp',
        languages: {
          fr: 'https://bricomaitre.com/fr/products/desk%20lamp',
          ar: 'https://bricomaitre.com/ar/products/desk%20lamp',
          'x-default': 'https://bricomaitre.com/fr/products/desk%20lamp',
        },
      },
      openGraph: { locale: 'ar_DZ' },
    });
  });

  it('publishes Product and breadcrumb JSON-LD with price and availability', () => {
    const data = buildProductStructuredData(product, 'fr', [
      { id: 1, label: 'Workshop', href: '/fr/products?category=1' },
      { id: 3, label: 'Lighting', href: '/fr/products?category=3' },
    ]);
    expect(data[0]).toMatchObject({
      '@type': 'Product',
      name: 'Desk Lamp',
      offers: {
        priceCurrency: 'DZD',
        price: '1500.00',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(data[1]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Accueil' },
        { position: 2, name: 'Produits' },
        { position: 3, name: 'Workshop', item: 'https://bricomaitre.com/fr/products?category=1' },
        { position: 4, name: 'Lighting', item: 'https://bricomaitre.com/fr/products?category=3' },
        { position: 5, name: 'Desk Lamp' },
      ],
    });
    expect(serializeStructuredData({ value: '</script>' })).not.toContain('</script>');
  });

  it('prevents missing products from being indexed', () => {
    expect(buildMissingProductMetadata('fr')).toMatchObject({
      robots: { index: false, follow: true },
    });
  });

  it('excludes untrusted image origins from social metadata and JSON-LD', () => {
    const unsafeProduct = {
      ...product,
      media: [
        { ...product.media[0], url: '/lamp.jpg' },
        { ...product.media[0], url: '//tracker.example.com/pixel.gif' },
      ],
    };

    expect(buildProductMetadata(unsafeProduct, 'fr').openGraph).toMatchObject({
      images: ['/lamp.jpg'],
    });
    expect(buildProductStructuredData(unsafeProduct, 'fr')[0]).toMatchObject({
      image: ['/lamp.jpg'],
    });
  });
});
