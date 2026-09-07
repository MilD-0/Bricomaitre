import { afterEach, describe, expect, it } from 'vitest';

import { toCsvBuffer } from './meta-catalog';
import { buildMetaCatalogExportRows } from './meta-catalog-shared';

describe('buildMetaCatalogExportRows', () => {
  const originalStorefrontBaseUrl = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL;

  afterEach(() => {
    if (originalStorefrontBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL = originalStorefrontBaseUrl;
  });

  it('uses the product inStock flag for Meta availability', () => {
    const rows = buildMetaCatalogExportRows(
      [
        {
          id: 1,
          slug: 'disabled-stock-toggle',
          title: 'Disabled stock toggle',
          description: 'Should export as out of stock',
          inStock: false,
          inventoryQuantity: 12,
          price: 19.5,
          oldPrice: null,
          brandId: 9,
          images: ['https://cdn.example.com/product.jpg'],
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      new Map([[9, 'Acme']]),
    );

    expect(rows).toEqual([
      {
        id: '1',
        contentId: '1',
        title: 'Disabled stock toggle',
        description: 'Should export as out of stock',
        availability: 'out of stock',
        condition: 'new',
        price: '19.5 DZD',
        salePrice: '',
        link: 'https://bricomaitre.com/products/disabled-stock-toggle',
        imageLink: 'https://cdn.example.com/product.jpg',
        brand: 'Acme',
      },
    ]);
  });

  it('exports compare-at price as the main price and current price as sale price', () => {
    const rows = buildMetaCatalogExportRows(
      [
        {
          id: 2,
          slug: 'discounted-roller',
          title: 'Discounted roller',
          description: 'Should export compare-at as price',
          inStock: true,
          inventoryQuantity: 5,
          price: '80',
          oldPrice: '100',
          brandId: 9,
          images: ['https://cdn.example.com/product-sale.jpg'],
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      new Map([[9, 'Acme']]),
    );

    expect(rows).toEqual([
      {
        id: '2',
        contentId: '2',
        title: 'Discounted roller',
        description: 'Should export compare-at as price',
        availability: 'in stock',
        condition: 'new',
        price: '100 DZD',
        salePrice: '80 DZD',
        link: 'https://bricomaitre.com/products/discounted-roller',
        imageLink: 'https://cdn.example.com/product-sale.jpg',
        brand: 'Acme',
      },
    ]);
  });

  it('uses the configured storefront base url when building product links', () => {
    process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL = 'https://storefront.example.com/';

    const rows = buildMetaCatalogExportRows(
      [
        {
          id: 3,
          slug: 'configured-domain',
          title: 'Configured domain',
          description: 'Should use the configured storefront base url',
          inStock: true,
          inventoryQuantity: 2,
          price: 42,
          oldPrice: null,
          brandId: null,
          images: [],
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      new Map(),
    );

    expect(rows[0]?.link).toBe('https://storefront.example.com/products/configured-domain');
    expect(rows[0]?.contentId).toBe('3');
  });

  it('falls back to numeric ids when a slug is unavailable', () => {
    const rows = buildMetaCatalogExportRows(
      [
        {
          id: 4,
          slug: null,
          title: 'Missing slug',
          description: null,
          inStock: true,
          inventoryQuantity: 1,
          price: 8,
          oldPrice: null,
          brandId: null,
          images: [],
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      new Map(),
    );

    expect(rows[0]?.link).toBe('https://bricomaitre.com/products/4');
    expect(rows[0]?.contentId).toBe('4');
  });

  it('serializes rows to csv with the shared header order', () => {
    const rows = buildMetaCatalogExportRows(
      [
        {
          id: 5,
          slug: 'quoted-product',
          title: 'Quoted, Product',
          description: 'Needs "csv" escaping',
          inStock: true,
          inventoryQuantity: 1,
          price: 10,
          oldPrice: null,
          brandId: 9,
          images: [],
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
      new Map([[9, 'Acme']]),
    );

    const csv = toCsvBuffer(rows).toString('utf8');

    expect(csv).toContain(
      'id,content_id,title,description,availability,condition,price,sale_price,link,image_link,brand',
    );
    expect(csv).toContain('"Quoted, Product"');
    expect(csv).toContain('"Needs ""csv"" escaping"');
    expect(csv).toContain('https://bricomaitre.com/products/quoted-product');
  });
});

it.each([100, 120, 0, null])('does not export a false discount for old price %s', (oldPrice) => {
  const [row] = buildMetaCatalogExportRows(
    [
      {
        id: 1,
        slug: 'drill',
        title: 'Drill',
        description: '',
        price: 120,
        oldPrice,
        images: [],
        brandId: null,
        inStock: true,
        inventoryQuantity: 10,
        updatedAt: new Date().toISOString(),
      },
    ],
    new Map(),
  );
  expect(row).toMatchObject({ price: '120 DZD', salePrice: '' });
});
