import { getStorefrontCatalogMeta } from '@/lib/storefront-api';
import { findTaxonomyBySlug } from '@/lib/taxonomy-routes';

type CatalogMeta = Awaited<ReturnType<typeof getStorefrontCatalogMeta>>;
type TaxonomyResult<T> =
  { status: 'found'; item: T } | { status: 'missing' } | { status: 'unavailable'; error: unknown };

async function resolveTaxonomy<T extends { id: number; slug?: string | null }>(
  slug: string,
  select: (meta: CatalogMeta) => T[],
  loadMeta: typeof getStorefrontCatalogMeta,
): Promise<TaxonomyResult<T>> {
  try {
    const item = findTaxonomyBySlug(select(await loadMeta()), slug);
    return item ? { status: 'found', item } : { status: 'missing' };
  } catch (error) {
    return { status: 'unavailable', error };
  }
}

export function resolveCategorySlug(
  slug: string,
  loadMeta: typeof getStorefrontCatalogMeta = getStorefrontCatalogMeta,
) {
  return resolveTaxonomy(slug, (meta) => meta.categories, loadMeta);
}

export function resolveBrandSlug(
  slug: string,
  loadMeta: typeof getStorefrontCatalogMeta = getStorefrontCatalogMeta,
) {
  return resolveTaxonomy(slug, (meta) => meta.brands, loadMeta);
}
