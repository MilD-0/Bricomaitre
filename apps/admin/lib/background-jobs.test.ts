import { describe, expect, it } from 'vitest';
import { filterCatalogFeedProducts } from './commerce-jobs/enqueue';

describe('filterCatalogFeedProducts', () => {
  it('keeps only active in-stock products for the storefront catalog feed', () => {
    const result = filterCatalogFeedProducts([
      { id: 1, active: true, inStock: true },
      { id: 2, active: true, inStock: false },
      { id: 3, active: false, inStock: true },
      { id: 4, active: true, inStock: true },
    ]);

    expect(result).toEqual([
      { id: 1, active: true, inStock: true },
      { id: 4, active: true, inStock: true },
    ]);
  });
});
