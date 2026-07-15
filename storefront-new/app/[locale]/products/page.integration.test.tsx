import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogPageContent } from './page';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  meta: vi.fn(),
  capture: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontCatalog: mocks.catalog,
  getStorefrontCatalogMeta: mocks.meta,
}));
vi.mock('@/lib/sentry', () => ({ captureCatalogPageException: mocks.capture }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', { ...props, fetchPriority: undefined }),
}));
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
}));
vi.mock('@/components/catalog-telemetry', () => ({ CatalogTelemetry: () => null }));
vi.mock('@/components/catalog-live-search', () => ({
  CatalogLiveSearch: ({ initialValue }: { initialValue: string }) => React.createElement('input', { name: 'q', value: initialValue, readOnly: true }),
}));
vi.mock('@/components/catalog-live-sort', () => ({
  CatalogLiveSort: ({ initialValue, label }: { initialValue: string; label: string }) => React.createElement('select', { name: 'sort', value: initialValue, 'aria-label': label, readOnly: true }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, number>) => ({
    eyebrow: 'Catalog', title: 'Products for your work', description: 'Find the right product', controls: 'Controls',
    filterTitle: 'Filter products', resultsLabel: 'Catalog results', applyFilters: 'Apply filters', viewProduct: 'View',
    searchLabel: 'Search', searchPlaceholder: 'Drill', categoryLabel: 'Category', allCategories: 'All categories',
    brandLabel: 'Brand', allBrands: 'All brands', sortLabel: 'Sort', sortRecommended: 'Recommended', sortNewest: 'Newest', sortPriceAsc: 'Low price',
    sortPriceDesc: 'High price', sortNameAsc: 'Name', apply: 'Apply', reset: 'Reset', inStock: 'In stock',
    outOfStock: 'Out of stock', priceOnRequest: 'Ask', unavailableTitle: 'Unavailable',
    unavailableDescription: 'Try later', emptyTitle: 'No products', emptyDescription: 'Change filters',
    pagination: 'Pagination', previous: 'Previous', next: 'Next',
    results: `${values?.count ?? 0} products`, page: `Page ${values?.page ?? 1}`,
  } as Record<string, string>)[key] ?? key),
}));

const product = {
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

describe('localized Catalog Page', () => {
  beforeEach(() => {
    mocks.catalog.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.meta.mockReset().mockResolvedValue({
      brands: [{ id: 2, name: 'Bric Pro', slug: 'bric-pro', image: null, featured: true, createdAt: product.createdAt, updatedAt: product.updatedAt }],
      categories: [{ id: 3, name: 'Lighting', nameAr: 'الإضاءة', slug: 'lighting', nameEn: null, image: null, parentId: null, properties: [], featured: true, createdAt: product.createdAt, updatedAt: product.updatedAt }],
    });
    mocks.capture.mockClear();
  });

  it('server-renders product discovery, filters, price, and stable product links', async () => {
    const element = await CatalogPageContent({
      params: Promise.resolve({ locale: 'fr' }),
      searchParams: Promise.resolve({ q: 'lamp', category: '3' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Products for your work');
    expect(html).toContain('Desk Lamp');
    expect(html).toContain('/fr/products/desk-lamp');
    expect(html).toContain('4 500');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="lamp"');
    expect(html).toContain('Filter products');
    expect(html).toContain('type="radio"');
    expect(html.match(/class="catalog-filter-options"/g)).toHaveLength(2);
    expect(html.match(/class="catalog-filter-group-heading"/g)).toHaveLength(2);
    expect(html).not.toContain('Apply</button>');
    expect(mocks.catalog).toHaveBeenCalledWith(expect.objectContaining({ search: 'lamp', categoryId: 3, limit: 24 }));
  });

  it('uses Arabic product and category copy from the same server contract', async () => {
    const element = await CatalogPageContent({
      params: Promise.resolve({ locale: 'ar' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('مصباح المكتب');
    expect(html).toContain('الإضاءة');
    expect(html).not.toContain('<h2>Desk Lamp</h2>');
  });

  it('degrades upstream failures to a safe empty catalog and records the error', async () => {
    mocks.catalog.mockRejectedValue(new Error('upstream unavailable'));
    const element = await CatalogPageContent({
      params: Promise.resolve({ locale: 'fr' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unavailable');
    expect(html).not.toContain('Desk Lamp');
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), { locale: 'fr', operation: 'catalog-read' });
  });
});
