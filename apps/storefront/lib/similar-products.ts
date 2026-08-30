import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { parseCatalogPageQuery } from '@/lib/catalog-query';

type Product = StorefrontProductsResponse['items'][number];

export function buildSimilarProductsQuery(categoryId: number | null, brandId: number | null) {
  return parseCatalogPageQuery({
    category: categoryId ? String(categoryId) : undefined,
    brand: !categoryId && brandId ? String(brandId) : undefined,
  });
}

export function rankSimilarProducts<T extends Pick<Product, 'id'>>(
  items: T[],
  currentProductId: number,
) {
  // The catalog query has already constrained the set to the current product's
  // category (or its brand as a fallback) and applies the canonical recommended
  // order. Preserve that order so featured groups and engagement signals stay
  // meaningful within an already relevant set.
  return items.filter((product) => product.id !== currentProductId);
}
