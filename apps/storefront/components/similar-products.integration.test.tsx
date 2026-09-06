import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SimilarProducts } from './similar-products';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), meta: vi.fn() }));
vi.mock('@/lib/storefront-api', () => ({
  getStorefrontCatalog: mocks.catalog,
  getStorefrontCatalogMeta: mocks.meta,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async ({ namespace }: { namespace: string }) =>
      (key: string) =>
        (
          ({
            similarTitle: 'Similar products',
            inStock: 'In stock',
            outOfStock: 'Unavailable',
            priceOnRequest: 'Ask',
            viewProduct: 'View',
            loadMore: 'Load more',
            loadingMore: 'Loading',
            loadError: 'Try again',
            endOfCatalog: 'All seen',
          }) as Record<string, string>
        )[key] ?? `${namespace}.${key}`,
  ),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}));
vi.mock('./similar-products-telemetry', () => ({ SimilarProductsTelemetry: () => null }));
vi.mock('./catalog-infinite-loader', () => ({
  CatalogInfiniteLoader: ({ pageSize, listContext }: { pageSize: number; listContext: string }) =>
    React.createElement('div', { 'data-page-size': pageSize, 'data-list-context': listContext }),
}));

const relatedProduct = {
  id: 13,
  slug: 'work-light',
  mongoId: null,
  title: 'Work Light',
  titleAr: null,
  description: null,
  descriptionAr: null,
  sku: null,
  barcode: null,
  price: '2200.00',
  oldPrice: null,
  inStock: true,
  availabilityStatus: 'in_stock',
  brandId: 2,
  categoryId: 3,
  images: [],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

describe('SimilarProducts', () => {
  beforeEach(() => {
    mocks.catalog.mockReset().mockResolvedValue({
      items: [{ ...relatedProduct, id: 12, slug: 'current-product' }, relatedProduct],
      total: 2,
    });
    mocks.meta.mockReset().mockResolvedValue({
      brands: [{ id: 2, name: 'Bric' }],
      categories: [{ id: 3, name: 'Lighting', nameAr: 'إضاءة' }],
    });
  });

  it('server-renders relevant cards and configures the bounded infinite feed', async () => {
    const element = await SimilarProducts({
      locale: 'fr',
      currentProductId: 12,
      categoryId: 3,
      brandId: 2,
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Similar products');
    expect(html).not.toContain('/fr/products/current-product');
    expect(html).toContain('/fr/products/work-light');
    expect(html).toContain('data-page-size="6"');
    expect(html).toContain('data-list-context="similar_products"');
    expect(mocks.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 3, brandId: null, limit: 7 }),
    );
  });

  it('degrades silently when recommendation data is unavailable', async () => {
    mocks.catalog.mockRejectedValue(new Error('catalog unavailable'));
    await expect(
      SimilarProducts({ locale: 'fr', currentProductId: 12, categoryId: 3, brandId: 2 }),
    ).resolves.toBeNull();
  });
});
