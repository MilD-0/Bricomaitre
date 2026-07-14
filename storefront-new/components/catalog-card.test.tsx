import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CatalogCard, type CatalogProduct } from './catalog-card';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.fetchPriority;
    return React.createElement('img', imageProps);
  },
}));

const product: CatalogProduct = {
  id: 12,
  slug: 'desk-lamp',
  mongoId: null,
  title: 'Desk Lamp',
  titleAr: 'مصباح المكتب',
  description: null,
  descriptionAr: null,
  sku: 'DL-1',
  barcode: null,
  price: '4500.00',
  oldPrice: '5200.00',
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 4,
  brandId: 2,
  categoryId: 3,
  images: ['/product-placeholder.svg'],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

const labels = {
  inStock: 'In stock',
  outOfStock: 'Unavailable',
  priceOnRequest: 'Ask',
  viewProduct: 'View',
};

describe('CatalogCard', () => {
  it('gives discount, availability, price, and the next action a clear server-rendered hierarchy', () => {
    const html = renderToStaticMarkup(
      <CatalogCard product={product} locale="fr" position={1} brandName="Bric Pro" labels={labels} />,
    );

    expect(html).toContain('−13%');
    expect(html).toContain('In stock');
    expect(html).toContain('4 500');
    expect(html).toContain('View');
    expect(html).toContain('/fr/products/desk-lamp');
    expect(html).toContain('loading="eager"');
  });

  it('uses localized RTL copy and exposes unavailability in both the media and product summary', () => {
    const html = renderToStaticMarkup(
      <CatalogCard product={{ ...product, inStock: false }} locale="ar" position={4} labels={{ ...labels, outOfStock: 'غير متوفر', viewProduct: 'عرض' }} />,
    );

    expect(html).toContain('مصباح المكتب');
    expect(html).toContain('غير متوفر');
    expect(html).toContain('عرض');
    expect(html).toContain('←');
    expect(html).toContain('loading="lazy"');
  });

  it('renders a canonical legacy HTTPS image instead of replacing it with a placeholder', () => {
    const html = renderToStaticMarkup(
      <CatalogCard
        product={{ ...product, images: ['https://legacy-media.example.com/catalog/tool.jpg'] }}
        locale="fr"
        position={4}
        labels={labels}
      />,
    );

    expect(html).toContain('src="https://legacy-media.example.com/catalog/tool.jpg"');
    expect(html).not.toContain('catalog-card-placeholder');
  });
});
