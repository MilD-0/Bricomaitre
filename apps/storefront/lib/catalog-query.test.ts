import { describe, expect, it } from 'vitest';

import {
  buildCatalogApiPath,
  buildCatalogPath,
  parseCatalogBatchSize,
  parseCatalogPageQuery,
  toStorefrontCatalogQuery,
} from './catalog-query';

describe('catalog query', () => {
  it('normalizes public URL values into a bounded canonical query', () => {
    const query = parseCatalogPageQuery({
      q: '  marteau  ',
      category: '3',
      brand: '2',
      discounted: '1',
      sort: 'price-asc',
      page: '4',
    });

    expect(query).toEqual({
      q: 'marteau',
      category: 3,
      brand: 2,
      discounted: true,
      minPrice: null,
      maxPrice: null,
      stock: 'all',
      sort: 'price-asc',
      page: 4,
    });
    expect(toStorefrontCatalogQuery(query)).toEqual({
      page: 4,
      limit: 24,
      search: 'marteau',
      categoryId: 3,
      brandId: 2,
      discounted: true,
      minPrice: null,
      maxPrice: null,
      stock: 'all',
      id: null,
      mongoId: null,
      slug: null,
      sortKey: 'price',
      sortDirection: 'asc',
    });
  });

  it('falls back field-by-field for hostile or malformed URL values', () => {
    expect(
      parseCatalogPageQuery({
        q: 'x'.repeat(81),
        category: '-1',
        brand: 'not-a-number',
        sort: 'delete-all',
        page: '0',
      }),
    ).toEqual({
      q: '',
      category: null,
      brand: null,
      discounted: false,
      minPrice: null,
      maxPrice: null,
      stock: 'all',
      sort: 'recommended',
      page: 1,
    });
  });

  it('preserves nullable price filters when a canonical query is parsed again on the client', () => {
    const canonical = parseCatalogPageQuery();
    const reparsed = parseCatalogPageQuery(canonical);

    expect(reparsed).toMatchObject({ minPrice: null, maxPrice: null });
    expect(parseCatalogPageQuery({ minPrice: '', maxPrice: null })).toMatchObject({
      minPrice: null,
      maxPrice: null,
    });
    expect(buildCatalogApiPath(reparsed, 2)).toBe('/api/catalog?page=2');
  });

  it('builds stable localized links and omits default parameters', () => {
    const query = parseCatalogPageQuery({
      q: 'perceuse',
      category: '3',
      discounted: '1',
      sort: 'name-asc',
    });
    expect(buildCatalogPath('fr', query, 2)).toBe(
      '/fr/products?q=perceuse&category=3&discounted=1&sort=name-asc&page=2',
    );
    expect(buildCatalogPath('ar', parseCatalogPageQuery())).toBe('/ar/products');
    expect(buildCatalogApiPath(query, 2)).toBe(
      '/api/catalog?q=perceuse&category=3&discounted=1&sort=name-asc&page=2',
    );
    expect(buildCatalogApiPath(parseCatalogPageQuery(), 1)).toBe('/api/catalog?page=1');
    expect(buildCatalogApiPath(parseCatalogPageQuery(), 2, 6)).toBe('/api/catalog?page=2&limit=6');
    expect(parseCatalogBatchSize('999')).toBe(24);
  });

  it('uses the intelligent recommended rank as the canonical default', () => {
    const query = parseCatalogPageQuery();

    expect(toStorefrontCatalogQuery(query)).toMatchObject({
      sortKey: 'recommended',
      sortDirection: 'desc',
    });
    expect(buildCatalogPath('fr', query)).toBe('/fr/products');
    expect(buildCatalogPath('fr', parseCatalogPageQuery({ sort: 'newest' }))).toBe(
      '/fr/products?sort=newest',
    );
    expect(buildCatalogPath('fr', parseCatalogPageQuery({ discounted: '1' }))).toBe(
      '/fr/products?discounted=1',
    );
  });
});
