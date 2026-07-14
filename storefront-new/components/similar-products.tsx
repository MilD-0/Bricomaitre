import { getTranslations } from 'next-intl/server';

import { CatalogCard } from '@/components/catalog-card';
import { CatalogInfiniteLoader } from '@/components/catalog-infinite-loader';
import { SimilarProductsTelemetry } from '@/components/similar-products-telemetry';
import type { Locale } from '@/i18n/config';
import { SIMILAR_PRODUCTS_PAGE_SIZE, toStorefrontCatalogQuery } from '@/lib/catalog-query';
import { buildSimilarProductsQuery, rankSimilarProducts } from '@/lib/similar-products';
import { getStorefrontCatalog, getStorefrontCatalogMeta } from '@/lib/storefront-api';

export async function SimilarProducts({
  locale,
  currentProductId,
  categoryId,
  brandId,
}: {
  locale: Locale;
  currentProductId: number;
  categoryId: number | null;
  brandId: number | null;
}) {
  const query = buildSimilarProductsQuery(categoryId, brandId);
  const catalogResult = await getStorefrontCatalog({
    ...toStorefrontCatalogQuery(query),
    limit: SIMILAR_PRODUCTS_PAGE_SIZE + 1,
  }).catch(() => null);
  if (!catalogResult) return null;

  const ranked = rankSimilarProducts(catalogResult.items, currentProductId, brandId);
  const products = ranked.slice(0, SIMILAR_PRODUCTS_PAGE_SIZE);
  const totalCount = Math.max(0, catalogResult.total - 1);
  const hasNextPage = products.length < totalCount;
  if (products.length === 0 && !hasNextPage) return null;

  const meta = await getStorefrontCatalogMeta().catch(() => ({ brands: [], categories: [] }));
  const brandNames = Object.fromEntries(meta.brands.map((brand) => [brand.id, brand.name]));
  const categoryNames = Object.fromEntries(meta.categories.map((category) => [
    category.id,
    locale === 'ar' && category.nameAr?.trim() ? category.nameAr : category.name,
  ]));
  const [t, catalogT] = await Promise.all([
    getTranslations({ locale, namespace: 'ProductDetail' }),
    getTranslations({ locale, namespace: 'Products' }),
  ]);
  const cardLabels = {
    inStock: catalogT('inStock'),
    outOfStock: catalogT('outOfStock'),
    priceOnRequest: catalogT('priceOnRequest'),
    viewProduct: catalogT('viewProduct'),
  };

  return (
    <section className="similar-products" data-similar-products aria-labelledby="similar-products-title">
      <SimilarProductsTelemetry locale={locale} productIds={products.map((product) => product.id)} />
      <header className="similar-products-heading">
        <h2 id="similar-products-title">{t('similarTitle')}</h2>
      </header>
      <div className="catalog-grid similar-products-grid">
        {products.map((product, index) => (
          <CatalogCard
            key={product.id}
            product={product}
            locale={locale}
            position={index + 1}
            brandName={product.brandId ? brandNames[product.brandId] : null}
            categoryName={product.categoryId ? categoryNames[product.categoryId] : null}
            labels={cardLabels}
          />
        ))}
        <CatalogInfiniteLoader
          locale={locale}
          query={query}
          initialCount={products.length}
          initialProductIds={[currentProductId, ...products.map((product) => product.id)]}
          initialHasNextPage={hasNextPage}
          totalCount={totalCount}
          brandNames={brandNames}
          categoryNames={categoryNames}
          pageSize={SIMILAR_PRODUCTS_PAGE_SIZE}
          listContext="similar_products"
          labels={{
            ...cardLabels,
            loadMore: catalogT('loadMore'),
            loading: catalogT('loadingMore'),
            loadError: catalogT('loadError'),
            end: catalogT('endOfCatalog'),
          }}
        />
      </div>
    </section>
  );
}
