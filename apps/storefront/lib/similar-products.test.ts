import { describe, expect, it } from 'vitest';

import { buildSimilarProductsQuery } from './similar-products';

describe('similar product matching', () => {
  it('uses category as the strongest relevance boundary and brand as fallback', () => {
    expect(buildSimilarProductsQuery(3, 2)).toMatchObject({
      category: 3,
      brand: null,
      sort: 'recommended',
    });
    expect(buildSimilarProductsQuery(null, 2)).toMatchObject({
      category: null,
      brand: 2,
      sort: 'recommended',
    });
  });
});
