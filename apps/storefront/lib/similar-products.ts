import { parseCatalogPageQuery } from '@/lib/catalog-query';

export function buildSimilarProductsQuery(categoryId: number | null, brandId: number | null) {
  return parseCatalogPageQuery({
    category: categoryId ? String(categoryId) : undefined,
    brand: !categoryId && brandId ? String(brandId) : undefined,
  });
}
