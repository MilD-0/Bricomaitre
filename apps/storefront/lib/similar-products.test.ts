import { describe, expect, it } from 'vitest';

import { buildSimilarProductsQuery, rankSimilarProducts } from './similar-products';

const product = (id: number, brandId: number | null, inStock: boolean) => ({
  id,
  brandId,
  inStock,
});

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

  it('excludes the current product while retaining the relevant recommended order', () => {
    const ranked = rankSimilarProducts(
      [
        product(12, 2, true),
        product(13, 4, true),
        product(14, 2, false),
        product(15, 2, true),
      ] as never[],
      12,
    );
    expect(ranked.map(({ id }) => id)).toEqual([13, 14, 15]);
  });
});
