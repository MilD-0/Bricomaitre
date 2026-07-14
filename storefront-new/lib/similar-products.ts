import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { parseCatalogPageQuery } from '@/lib/catalog-query';

type Product = StorefrontProductsResponse['items'][number];

export function buildSimilarProductsQuery(categoryId: number | null, brandId: number | null) {
  return parseCatalogPageQuery({
    category: categoryId ? String(categoryId) : undefined,
    brand: !categoryId && brandId ? String(brandId) : undefined,
  });
}

export function rankSimilarProducts(items: Product[], currentProductId: number, preferredBrandId: number | null) {
  return items
    .map((product, index) => ({
      product,
      index,
      score: (preferredBrandId && product.brandId === preferredBrandId ? 4 : 0)
        + (product.inStock ? 2 : 0),
    }))
    .filter(({ product }) => product.id !== currentProductId)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ product }) => product);
}
