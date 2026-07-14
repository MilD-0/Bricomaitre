import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateStaticParams, ProductPageContent } from './page';

const {
  getProductMock,
  getCatalogMock,
  notFoundMock,
  permanentRedirectMock,
  captureProductPageExceptionMock,
} = vi.hoisted(() => ({
  getProductMock: vi.fn(),
  getCatalogMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  permanentRedirectMock: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
  captureProductPageExceptionMock: vi.fn(),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontProductDetail: getProductMock,
  getStorefrontCatalog: getCatalogMock,
}));
vi.mock('@/lib/sentry', () => ({ captureProductPageException: captureProductPageExceptionMock }));
vi.mock('next/navigation', () => ({ notFound: notFoundMock, permanentRedirect: permanentRedirectMock }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) => values?.sku ?? ({
    breadcrumbs: 'Breadcrumbs', home: 'Home', products: 'Products', gallery: 'Gallery', image: 'Image',
    noImage: 'No image', price: 'Price', inStock: 'In stock', outOfStock: 'Out of stock',
    quantity: 'Quantity', decrease: 'Decrease', increase: 'Increase', addToCart: 'Add to cart',
    buyNow: 'Buy now', addedToCart: 'Added', unavailableAction: 'Unavailable', trustTitle: 'Trust',
    trustConfirmation: 'Phone confirmation', trustPayment: 'Cash on delivery', trustDelivery: 'Delivery',
    detailsEyebrow: 'About', detailsTitle: 'Product details', unavailableEyebrow: 'Unavailable',
    unavailableTitle: 'Cannot load product', unavailableDescription: 'Try later', backToProducts: 'Products',
  } as Record<string, string>)[key] ?? key),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...props }, children),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
}));
vi.mock('@/components/product-media', () => ({
  ProductMedia: ({ productName }: { productName: string }) => React.createElement('div', { 'data-media': productName }),
}));
vi.mock('@/components/product-actions', () => ({
  ProductActions: ({ available }: { available: boolean }) => React.createElement('div', { 'data-actions': available }),
}));
vi.mock('@/components/product-telemetry', () => ({ ProductTelemetry: () => null }));
vi.mock('@/components/similar-products', () => ({
  SimilarProducts: ({ currentProductId }: { currentProductId: number }) => React.createElement('section', { 'data-similar-for': currentProductId }),
}));

const productResponse = {
  item: {
    id: 12,
    canonicalToken: 'desk-lamp',
    title: 'Desk Lamp',
    titleAr: 'مصباح مكتب',
    description: 'Warm workshop light.',
    descriptionAr: 'إضاءة دافئة للورشة.',
    sku: 'DL-1',
    barcode: null,
    price: '1500.00',
    oldPrice: '1750.00',
    availability: { status: 'in_stock', inStock: true, quantity: 4 },
    media: [{ url: '/product.jpg', position: 0, width: 900, height: 900, blurDataUrl: null }],
    brand: { id: 2, name: 'Bric', slug: 'bric', image: '/brand.svg' },
    category: { id: 3, name: 'Lighting', nameAr: 'إضاءة', slug: 'lighting', image: null, parentId: null, properties: [] },
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  resolution: { requestedToken: 'desk-lamp', matchedBy: 'slug' as const, canonicalToken: 'desk-lamp' },
};

describe('localized Product Detail Page', () => {
  beforeEach(() => {
    getProductMock.mockReset();
    getProductMock.mockResolvedValue(productResponse);
    getCatalogMock.mockReset();
    notFoundMock.mockClear();
    permanentRedirectMock.mockClear();
    captureProductPageExceptionMock.mockClear();
  });

  it('provides canonical product-token samples for Cache Components validation', async () => {
    getCatalogMock.mockResolvedValue({ items: [
      { id: 12, slug: 'desk-lamp', mongoId: 'legacy-lamp' },
      { id: 13, slug: null, mongoId: 'legacy-drill' },
      { id: 14, slug: null, mongoId: null },
    ] });
    await expect(generateStaticParams()).resolves.toEqual([
      { token: 'desk-lamp' },
      { token: 'legacy-drill' },
      { token: '14' },
    ]);
  });

  it('server-renders French product, commerce facts, and structured data', async () => {
    const element = await ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('<h1>Desk Lamp</h1>');
    expect(html).toContain('Warm workshop light.');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('schema.org');
    expect(html).toContain('data-actions="true"');
    expect(html).toMatch(/<img[^>]+alt="Bric"/);
    expect(html).toContain('data-similar-for="12"');
  });

  it('server-renders localized Arabic copy from the same contract', async () => {
    const element = await ProductPageContent({ params: Promise.resolve({ locale: 'ar', token: 'desk-lamp' }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('مصباح مكتب');
    expect(html).toContain('إضاءة دافئة للورشة.');
    expect(html).not.toContain('<h1>Desk Lamp</h1>');
  });

  it('permanently redirects legacy identifiers to the localized canonical token', async () => {
    getProductMock.mockResolvedValue({
      ...productResponse,
      resolution: { requestedToken: 'legacy-lamp', matchedBy: 'mongoId', canonicalToken: 'desk-lamp' },
    });

    await expect(ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'legacy-lamp' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/fr/products/desk-lamp');
  });

  it('uses not-found semantics for a genuinely missing product', async () => {
    getProductMock.mockResolvedValue(null);
    await expect(ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'missing' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('uses not-found semantics for an invalid product token', async () => {
    const { z } = await import('zod');
    getProductMock.mockRejectedValue(z.string().min(1).safeParse('').error);
    await expect(ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: '' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders a recoverable state and records controlled upstream failures', async () => {
    getProductMock.mockRejectedValue(new Error('upstream unavailable'));
    const element = await ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Cannot load product');
    expect(captureProductPageExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      locale: 'fr',
      requestedToken: 'desk-lamp',
      operation: 'product-detail-read',
    });
  });
});
