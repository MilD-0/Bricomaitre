import type { Locale } from '@/i18n/config';
import { parseCatalogPageQuery, type CatalogSearchParams } from '@/lib/catalog-query';
import { getStorefrontCatalogMeta } from '@/lib/storefront-api';
import { getBrandPath, getCategoryPath } from '@/lib/taxonomy-routes';

export async function resolveLegacyTaxonomyRedirect(
  locale: Locale,
  values: CatalogSearchParams,
  loadMeta: typeof getStorefrontCatalogMeta = getStorefrontCatalogMeta,
) {
  const query = parseCatalogPageQuery(values);
  const isSingleTaxonomyFilter = (query.category === null) !== (query.brand === null);
  if (query.q || query.sort !== 'recommended' || query.page !== 1 || !isSingleTaxonomyFilter) return null;

  try {
    const meta = await loadMeta();
    if (query.category !== null) {
      const category = meta.categories.find((entry) => entry.id === query.category);
      return category?.slug?.trim() ? getCategoryPath(locale, category) : null;
    }
    const brand = meta.brands.find((entry) => entry.id === query.brand);
    return brand?.slug?.trim() ? getBrandPath(locale, brand) : null;
  } catch {
    return null;
  }
}
