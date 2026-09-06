import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { CatalogTelemetry } from '@/components/catalog-telemetry';
import { CatalogCard } from '@/components/catalog-card';
import { CatalogInfiniteLoader } from '@/components/catalog-infinite-loader';
import { CatalogFilters } from '@/components/catalog-filters';
import { CatalogLiveSearch } from '@/components/catalog-live-search';
import { CatalogLiveSort } from '@/components/catalog-live-sort';
import { PageShell } from '@/components/page-shell';
import { StructuredData } from '@/components/structured-data';
import { isLocale } from '@/i18n/config';
import {
  buildCatalogPath,
  CATALOG_PAGE_SIZE,
  isFilteredCatalog,
  parseCatalogPageQuery,
  toStorefrontCatalogQuery,
  type CatalogSearchParams,
} from '@/lib/catalog-query';
import { buildCatalogStructuredData } from '@/lib/catalog-seo';
import { captureCatalogPageException } from '@/lib/sentry';
import { getStorefrontCatalog, getStorefrontCatalogMeta } from '@/lib/storefront-api';

export type CatalogHeading = {
  title: string;
  description: string;
};

export type CatalogPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export type CatalogPageContentProps = CatalogPageProps & {
  heading?: CatalogHeading;
};

export async function resolveCatalogLocale(params: CatalogPageProps['params']) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export async function CatalogPageContent({
  params,
  searchParams,
  heading,
}: CatalogPageContentProps) {
  const [locale, values, requestHeaders] = await Promise.all([
    resolveCatalogLocale(params),
    searchParams,
    headers(),
  ]);
  const query = parseCatalogPageQuery(values);
  const t = await getTranslations({ locale, namespace: 'Products' });
  let products: StorefrontProductsResponse['items'] = [];
  let totalProducts = 0;
  let brands: Awaited<ReturnType<typeof getStorefrontCatalogMeta>>['brands'] = [];
  let categories: Awaited<ReturnType<typeof getStorefrontCatalogMeta>>['categories'] = [];
  let unavailable = false;

  try {
    const [catalog, meta] = await Promise.all([
      getStorefrontCatalog(toStorefrontCatalogQuery(query)),
      getStorefrontCatalogMeta(),
    ]);
    products = catalog.items;
    totalProducts = catalog.total;
    brands = meta.brands;
    categories = meta.categories;
  } catch (error) {
    unavailable = true;
    captureCatalogPageException(error, { locale, operation: 'catalog-read' });
  }

  const hasNextPage = query.page * CATALOG_PAGE_SIZE < totalProducts;
  const visibleProducts = products.slice(0, CATALOG_PAGE_SIZE);
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <PageShell locale={locale}>
      <StructuredData
        value={buildCatalogStructuredData(visibleProducts, locale, heading?.title)}
        nonce={requestHeaders.get('x-nonce') ?? undefined}
      />
      <CatalogTelemetry
        locale={locale}
        query={query}
        resultsCount={totalProducts}
        visibleProductIds={visibleProducts.map((product) => product.id)}
      />

      <header className="catalog-heading">
        <h1>{heading?.title ?? t('title')}</h1>
        <p>{heading?.description ?? t('description')}</p>
      </header>

      <div className="catalog-layout" aria-label={t('controls')}>
        <CatalogFilters
          locale={locale}
          categories={categories.map((category) => ({
            id: category.id,
            label: locale === 'ar' && category.nameAr?.trim() ? category.nameAr : category.name,
            parentId: category.parentId,
            productCount: category.productCount,
          }))}
          brands={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
          selectedCategory={query.category}
          selectedBrand={query.brand}
          discounted={query.discounted}
          stock={query.stock}
          minPrice={query.minPrice}
          maxPrice={query.maxPrice}
          search={query.q}
          sort={query.sort}
          labels={{
            title: t('filterTitle'),
            close: t('closeFilters'),
            category: t('categoryLabel'),
            allCategories: t('allCategories'),
            brand: t('brandLabel'),
            allBrands: t('allBrands'),
            stock: t('stockLabel'),
            inStock: t('inStock'),
            price: t('priceLabel'),
            minPrice: t('minPrice'),
            maxPrice: t('maxPrice'),
            apply: t('applyFilters'),
            reset: t('reset'),
          }}
        />

        <section className="catalog-listing" aria-label={t('resultsLabel')}>
          <div className="catalog-toolbar">
            <CatalogLiveSearch
              initialValue={query.q}
              label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              searchingLabel={t('searching')}
            />
            <CatalogLiveSort
              initialValue={query.sort}
              label={t('sortLabel')}
              options={[
                { value: 'recommended', label: t('sortRecommended') },
                { value: 'newest', label: t('sortNewest') },
                { value: 'price-asc', label: t('sortPriceAsc') },
                { value: 'price-desc', label: t('sortPriceDesc') },
                { value: 'name-asc', label: t('sortNameAsc') },
              ]}
            />
          </div>

          <div className="catalog-results-heading" aria-live="polite">
            <strong>{t('results', { count: totalProducts })}</strong>
            {query.page > 1 ? <span>{t('page', { page: query.page })}</span> : null}
          </div>

          {isFilteredCatalog({ ...query, page: 1, sort: 'recommended', q: '' }) ? (
            <div className="catalog-active-filters" aria-label={t('activeFilters')}>
              {query.category !== null ? (
                <a href={buildCatalogPath(locale, { ...query, category: null, page: 1 })}>
                  {categoryById.get(query.category)?.name ?? t('categoryLabel')} ×
                </a>
              ) : null}
              {query.brand !== null ? (
                <a href={buildCatalogPath(locale, { ...query, brand: null, page: 1 })}>
                  {brandById.get(query.brand)?.name ?? t('brandLabel')} ×
                </a>
              ) : null}
              {query.stock !== 'all' ? (
                <a href={buildCatalogPath(locale, { ...query, stock: 'all', page: 1 })}>
                  {query.stock === 'in' ? t('inStock') : t('outOfStock')} ×
                </a>
              ) : null}
              {query.discounted ? (
                <a href={buildCatalogPath(locale, { ...query, discounted: false, page: 1 })}>
                  {t('discounted')} ×
                </a>
              ) : null}
              {query.minPrice !== null || query.maxPrice !== null ? (
                <a
                  href={buildCatalogPath(locale, {
                    ...query,
                    minPrice: null,
                    maxPrice: null,
                    page: 1,
                  })}
                >
                  {t('priceRange')} ×
                </a>
              ) : null}
            </div>
          ) : null}

          {unavailable ? (
            <section className="catalog-state" role="status">
              <span aria-hidden="true">!</span>
              <h2>{t('unavailableTitle')}</h2>
              <p>{t('unavailableDescription')}</p>
            </section>
          ) : visibleProducts.length === 0 ? (
            <section className="catalog-state">
              <span aria-hidden="true">0</span>
              <h2>{t('emptyTitle')}</h2>
              <p>{t('emptyDescription')}</p>
              {isFilteredCatalog(query) ? (
                <a href={`/${locale}/products`} className="button button-secondary">
                  {t('reset')}
                </a>
              ) : null}
            </section>
          ) : (
            <div className="catalog-grid">
              {visibleProducts.map((product, index) => {
                const brand = product.brandId ? brandById.get(product.brandId) : null;
                const category = product.categoryId ? categoryById.get(product.categoryId) : null;
                return (
                  <CatalogCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    position={index + 1}
                    brandName={brand?.name}
                    categoryName={
                      locale === 'ar' && category?.nameAr ? category.nameAr : category?.name
                    }
                    labels={{
                      inStock: t('inStock'),
                      outOfStock: t('outOfStock'),
                      priceOnRequest: t('priceOnRequest'),
                      viewProduct: t('viewProduct'),
                    }}
                  />
                );
              })}
              <CatalogInfiniteLoader
                locale={locale}
                query={query}
                initialCount={visibleProducts.length}
                initialProductIds={visibleProducts.map((product) => product.id)}
                initialHasNextPage={hasNextPage}
                totalCount={totalProducts}
                brandNames={Object.fromEntries(brands.map((brand) => [brand.id, brand.name]))}
                categoryNames={Object.fromEntries(
                  categories.map((category) => [
                    category.id,
                    locale === 'ar' && category.nameAr?.trim() ? category.nameAr : category.name,
                  ]),
                )}
                labels={{
                  inStock: t('inStock'),
                  outOfStock: t('outOfStock'),
                  priceOnRequest: t('priceOnRequest'),
                  viewProduct: t('viewProduct'),
                  loadMore: t('loadMore'),
                  loading: t('loadingMore'),
                  loadError: t('loadError'),
                  end: t('endOfCatalog'),
                }}
              />
            </div>
          )}

          {(query.page > 1 || hasNextPage) && !unavailable ? (
            <noscript>
              <nav className="catalog-pagination" aria-label={t('pagination')}>
                {query.page > 1 ? (
                  <a href={buildCatalogPath(locale, query, query.page - 1)} rel="prev">
                    {t('previous')}
                  </a>
                ) : (
                  <span />
                )}
                <span>{t('page', { page: query.page })}</span>
                {hasNextPage ? (
                  <a href={buildCatalogPath(locale, query, query.page + 1)} rel="next">
                    {t('next')}
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            </noscript>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
