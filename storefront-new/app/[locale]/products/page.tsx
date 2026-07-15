import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { CatalogTelemetry } from '@/components/catalog-telemetry';
import { CatalogCard, getCatalogProductTitle, getCatalogProductToken } from '@/components/catalog-card';
import { CatalogInfiniteLoader } from '@/components/catalog-infinite-loader';
import { CatalogLiveSearch } from '@/components/catalog-live-search';
import { CatalogLiveSort } from '@/components/catalog-live-sort';
import { PageShell } from '@/components/page-shell';
import { isLocale } from '@/i18n/config';
import {
  buildCatalogPath,
  CATALOG_PAGE_SIZE,
  isFilteredCatalog,
  parseCatalogPageQuery,
  toStorefrontCatalogQuery,
  type CatalogSearchParams,
} from '@/lib/catalog-query';
import { buildCatalogMetadata, buildCatalogStructuredData } from '@/lib/catalog-seo';
import { formatProductPrice } from '@/lib/product-presentation';
import { serializeStructuredData } from '@/lib/product-seo';
import { captureCatalogPageException } from '@/lib/sentry';
import { fetchStorefrontCatalog, getStorefrontCatalog, getStorefrontCatalogMeta } from '@/lib/storefront-api';

type CatalogPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

async function resolveLocale(params: CatalogPageProps['params']) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export async function generateMetadata({ params, searchParams }: CatalogPageProps): Promise<Metadata> {
  const [locale, values] = await Promise.all([resolveLocale(params), searchParams]);
  return buildCatalogMetadata(locale, isFilteredCatalog(parseCatalogPageQuery(values)));
}

export async function CatalogPageContent({ params, searchParams }: CatalogPageProps) {
  const [locale, values] = await Promise.all([resolveLocale(params), searchParams]);
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(buildCatalogStructuredData(visibleProducts, locale)) }}
      />
      <CatalogTelemetry
        locale={locale}
        query={query}
        resultsCount={totalProducts}
        visibleProductIds={visibleProducts.map((product) => product.id)}
      />

      <header className="catalog-heading">
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </header>

      <form className="catalog-layout" action={`/${locale}/products`} method="get" aria-label={t('controls')}>
        <aside className="catalog-filters">
          <input className="catalog-filter-toggle" id={`catalog-filter-toggle-${locale}`} type="checkbox" />
          <label className="catalog-filter-heading" htmlFor={`catalog-filter-toggle-${locale}`}>
            <h2>{t('filterTitle')}</h2>
            <span aria-hidden="true">⌄</span>
          </label>

          <div className="catalog-filter-content">
            <fieldset>
              <legend className="sr-only">{t('categoryLabel')}</legend>
              <h3 className="catalog-filter-group-heading">{t('categoryLabel')}</h3>
              <div className="catalog-filter-options">
                <label>
                  <input type="radio" name="category" value="" defaultChecked={query.category === null} />
                  <span>{t('allCategories')}</span>
                </label>
                {categories.map((category) => (
                  <label key={category.id}>
                    <input type="radio" name="category" value={category.id} defaultChecked={query.category === category.id} />
                    <span>{locale === 'ar' && category.nameAr?.trim() ? category.nameAr : category.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="sr-only">{t('brandLabel')}</legend>
              <h3 className="catalog-filter-group-heading">{t('brandLabel')}</h3>
              <div className="catalog-filter-options">
                <label>
                  <input type="radio" name="brand" value="" defaultChecked={query.brand === null} />
                  <span>{t('allBrands')}</span>
                </label>
                {brands.map((brand) => (
                  <label key={brand.id}>
                    <input type="radio" name="brand" value={brand.id} defaultChecked={query.brand === brand.id} />
                    <span>{brand.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="catalog-filter-actions">
              <button type="submit" className="button button-primary catalog-filter-submit">{t('applyFilters')}</button>
              {isFilteredCatalog(query) ? <a href={`/${locale}/products`} className="catalog-reset">{t('reset')}</a> : null}
            </div>
          </div>
        </aside>

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
              {isFilteredCatalog(query) ? <a href={`/${locale}/products`} className="button button-secondary">{t('reset')}</a> : null}
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
                    categoryName={locale === 'ar' && category?.nameAr ? category.nameAr : category?.name}
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
                categoryNames={Object.fromEntries(categories.map((category) => [
                  category.id,
                  locale === 'ar' && category.nameAr?.trim() ? category.nameAr : category.name,
                ]))}
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
                {query.page > 1 ? <a href={buildCatalogPath(locale, query, query.page - 1)} rel="prev">{t('previous')}</a> : <span />}
                <span>{t('page', { page: query.page })}</span>
                {hasNextPage ? <a href={buildCatalogPath(locale, query, query.page + 1)} rel="next">{t('next')}</a> : <span />}
              </nav>
            </noscript>
          ) : null}
        </section>
      </form>
    </PageShell>
  );
}

export default function CatalogPage(props: CatalogPageProps) {
  return (
    <>
      <CatalogNoScriptCatalog />
      <Suspense fallback={<CatalogLoading />}>
        <CatalogPageContent {...props} />
      </Suspense>
    </>
  );
}

async function CatalogNoScriptCatalog() {
  'use cache';

  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  let products: StorefrontProductsResponse['items'] = [];
  let hasNextPage = false;
  try {
    const response = await fetchStorefrontCatalog(toStorefrontCatalogQuery(parseCatalogPageQuery()));
    hasNextPage = response.total > CATALOG_PAGE_SIZE;
    products = response.items.slice(0, CATALOG_PAGE_SIZE);
  } catch {
    return null;
  }

  return (
    <noscript>
      <main className="catalog-noscript">
        {(['fr', 'ar'] as const).map((locale) => (
          <section key={locale} className={`catalog-noscript-${locale}`} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <h1>{locale === 'ar' ? 'منتجات بريكوماتر' : 'Produits Bricomaitre'}</h1>
            <ul>
              {products.map((product) => (
                <li key={product.id}>
                  <a href={`/${locale}/products/${encodeURIComponent(getCatalogProductToken(product))}`}>
                    <h2>{getCatalogProductTitle(product, locale)}</h2>
                    {product.price ? <span>{formatProductPrice(product.price, locale)}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
            {hasNextPage ? (
              <a className="button button-secondary" href={`/${locale}/products?page=2`} rel="next">
                {locale === 'ar' ? 'المنتجات التالية' : 'Produits suivants'}
              </a>
            ) : null}
          </section>
        ))}
      </main>
    </noscript>
  );
}

function CatalogLoading() {
  return (
    <div className="catalog-loading" aria-busy="true" aria-label="Loading catalog">
      <div />
      <div>{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>
    </div>
  );
}
