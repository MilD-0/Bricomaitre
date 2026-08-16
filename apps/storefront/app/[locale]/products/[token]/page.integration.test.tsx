import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProductPage from './page';
import { ProductPageContent } from './page-content';

const {
  getProductMock,
  getCatalogMetaMock,
  getSettingsMock,
  notFoundMock,
  permanentRedirectMock,
  captureProductPageExceptionMock,
} = vi.hoisted(() => ({
  getProductMock: vi.fn(),
  getCatalogMetaMock: vi.fn(),
  getSettingsMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  captureProductPageExceptionMock: vi.fn(),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontProductDetail: getProductMock,
  getStorefrontCatalogMeta: getCatalogMetaMock,
  getStorefrontSettings: getSettingsMock,
}));
vi.mock('@/lib/sentry', () => ({ captureProductPageException: captureProductPageExceptionMock }));
vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  permanentRedirect: permanentRedirectMock,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async () => (key: string, values?: Record<string, string>) =>
      values?.sku ??
      (
        {
          breadcrumbs: 'Breadcrumbs',
          home: 'Home',
          products: 'Products',
          gallery: 'Gallery',
          image: 'Image',
          noImage: 'No image',
          price: 'Price',
          inStock: 'In stock',
          outOfStock: 'Out of stock',
          quantity: 'Quantity',
          decrease: 'Decrease',
          increase: 'Increase',
          addToCart: 'Add to cart',
          buyNow: 'Buy now',
          addedToCart: 'Added',
          unavailableAction: 'Unavailable',
          trustTitle: 'Trust',
          trustConfirmation: 'Phone confirmation',
          trustPayment: 'Cash on delivery',
          trustDelivery: 'Delivery',
          detailsEyebrow: 'About',
          detailsTitle: 'Product details',
          unavailableEyebrow: 'Unavailable',
          unavailableTitle: 'Cannot load product',
          unavailableDescription: 'Try later',
          backToProducts: 'Products',
        } as Record<string, string>
      )[key] ??
      key,
  ),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('main', null, children),
}));
vi.mock('@/components/product-media', () => ({
  ProductMedia: ({ productName }: { productName: string }) =>
    React.createElement('div', { 'data-media': productName }),
}));
vi.mock('@/components/product-actions', () => ({
  ProductActions: ({
    available,
    support,
  }: {
    available: boolean;
    support?: { contact: { phoneDisplay: string } };
  }) =>
    React.createElement('div', {
      'data-actions': available,
      'data-support-phone': support?.contact.phoneDisplay,
    }),
}));
vi.mock('@/components/product-telemetry', () => ({ ProductTelemetry: () => null }));
vi.mock('@/components/similar-products', () => ({
  SimilarProducts: ({ currentProductId }: { currentProductId: number }) =>
    React.createElement('section', { 'data-similar-for': currentProductId }),
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
    category: {
      id: 3,
      name: 'Lighting',
      nameAr: 'إضاءة',
      slug: 'lighting',
      image: null,
      parentId: 2,
      properties: [],
    },
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  resolution: {
    requestedToken: 'desk-lamp',
    matchedBy: 'slug' as const,
    canonicalToken: 'desk-lamp',
  },
};

describe('localized Product Detail Page', () => {
  beforeEach(() => {
    getProductMock.mockReset();
    getProductMock.mockResolvedValue(productResponse);
    getCatalogMetaMock.mockReset().mockResolvedValue({
      brands: [],
      categories: [
        { id: 1, name: 'Workshop', nameAr: 'الورشة', slug: 'workshop', parentId: null },
        { id: 2, name: 'Electrical', nameAr: 'كهربائي', slug: 'electrical', parentId: 1 },
      ],
    });
    getSettingsMock.mockReset().mockResolvedValue({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
    });
    notFoundMock.mockClear();
    permanentRedirectMock.mockClear();
    captureProductPageExceptionMock.mockClear();
  });

  it('renders complete HTML for on-demand ISR product requests', async () => {
    const page = await ProductPage({
      params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('<h1>Desk Lamp</h1>');
  });

  it('starts supporting reads without waiting for the product response', async () => {
    let resolveProduct!: (value: typeof productResponse) => void;
    getProductMock.mockReturnValue(
      new Promise((resolve) => {
        resolveProduct = resolve;
      }),
    );

    const pagePromise = ProductPageContent({
      params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }),
    });
    await vi.waitFor(() => {
      expect(getSettingsMock).toHaveBeenCalledOnce();
      expect(getCatalogMetaMock).toHaveBeenCalledOnce();
    });

    resolveProduct(productResponse);
    const html = renderToStaticMarkup(await pagePromise);
    expect(html).toContain('<h1>Desk Lamp</h1>');
  });

  it('server-renders French product, commerce facts, and structured data', async () => {
    const element = await ProductPageContent({
      params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('<h1>Desk Lamp</h1>');
    expect(html).toContain('Warm workshop light.');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('schema.org');
    expect(html).toContain('data-actions="true"');
    expect(html).toContain('data-support-phone="0795 34 28 26"');
    expect(html).toMatch(/<img[^>]+alt="Bric"/);
    expect(html).toContain('data-similar-for="12"');
    expect(html).toContain('product-current-price');
    expect(html).toContain('product-compare-price');
    expect(html).toContain('href="/fr/categories/workshop"');
    expect(html).toContain('href="/fr/categories/electrical"');
    expect(html).toContain('href="/fr/categories/lighting"');
    expect(html.indexOf('href="/fr/categories/workshop">Workshop')).toBeLessThan(
      html.indexOf('href="/fr/categories/electrical">Electrical'),
    );
    expect(html.indexOf('href="/fr/categories/electrical">Electrical')).toBeLessThan(
      html.indexOf('href="/fr/categories/lighting">Lighting'),
    );
  });

  it('server-renders localized Arabic copy from the same contract', async () => {
    const element = await ProductPageContent({
      params: Promise.resolve({ locale: 'ar', token: 'desk-lamp' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('مصباح مكتب');
    expect(html).toContain('إضاءة دافئة للورشة.');
    expect(html).toContain('الورشة');
    expect(html).toContain('كهربائي');
    expect(html).not.toContain('<h1>Desk Lamp</h1>');
  });

  it('permanently redirects legacy identifiers to the localized canonical token', async () => {
    getProductMock.mockResolvedValue({
      ...productResponse,
      resolution: {
        requestedToken: 'legacy-lamp',
        matchedBy: 'mongoId',
        canonicalToken: 'desk-lamp',
      },
    });

    await expect(
      ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'legacy-lamp' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/fr/products/desk-lamp');
  });

  it('uses not-found semantics for a genuinely missing product', async () => {
    getProductMock.mockResolvedValue(null);
    await expect(
      ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: 'missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('uses not-found semantics for an invalid product token', async () => {
    const { z } = await import('zod');
    getProductMock.mockRejectedValue(z.string().min(1).safeParse('').error);
    await expect(
      ProductPageContent({ params: Promise.resolve({ locale: 'fr', token: '' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders a recoverable state and records controlled upstream failures', async () => {
    getProductMock.mockRejectedValue(new Error('upstream unavailable'));
    const element = await ProductPageContent({
      params: Promise.resolve({ locale: 'fr', token: 'desk-lamp' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Cannot load product');
    expect(captureProductPageExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      locale: 'fr',
      requestedToken: 'desk-lamp',
      operation: 'product-detail-read',
    });
  });
});
