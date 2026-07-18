import {
  storefrontBrandsResponseSchema,
  storefrontCategoriesResponseSchema,
  storefrontEcotrackCatalogResponseSchema,
  storefrontHomepageResponseSchema,
  storefrontHomepageFeaturedGroupProductsQuerySchema,
  storefrontHomepageFeaturedGroupProductsResponseSchema,
  storefrontProductDetailResponseSchema,
  storefrontReadOrderResponseSchema,
  storefrontProductListQuerySchema,
  storefrontProductsResponseSchema,
  storefrontSettingsResponseSchema,
  storefrontProductTokenSchema,
  type StorefrontBrandsResponse,
  type StorefrontCategoriesResponse,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontHomepageResponse,
  type StorefrontHomepageFeaturedGroupProductsResponse,
  type StorefrontProductDetailResponse,
  type StorefrontProductListQuery,
  type StorefrontProductsResponse,
  type StorefrontOrderResponseItem,
  type StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';
import { landingPageLocaleSchema, landingPageSlugSchema, storefrontLandingPageResponseSchema, storefrontLandingPageSitemapResponseSchema, type StorefrontLandingPageResponse } from '@bric/storefront-core/landing-pages';
import { cacheLife, cacheTag } from 'next/cache';

import {
  getStorefrontProductCacheTag,
  getStorefrontLandingPageCacheTag,
  STOREFRONT_NEW_CACHE_TAGS,
} from './cache-tags';
import {
  fetchStorefrontUpstream,
  StorefrontUpstreamError,
} from './storefront-upstream';

export async function fetchStorefrontLandingPage(locale: string, slug: string): Promise<StorefrontLandingPageResponse | null> {
  const parsedLocale = landingPageLocaleSchema.parse(locale);
  const parsedSlug = landingPageSlugSchema.parse(slug);
  const pathname = `/storefront/landing-pages/${encodeURIComponent(parsedSlug)}?locale=${parsedLocale}`;
  const response = await fetchStorefrontUpstream(pathname);
  if (response.status === 404) return null;
  return parseUpstreamJson(response, pathname, storefrontLandingPageResponseSchema);
}

export async function getStorefrontLandingPage(locale: string, slug: string) {
  'use cache';
  cacheLife({ stale: 30, revalidate: 120, expire: 600 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.landingPages, getStorefrontLandingPageCacheTag(locale, slug));
  return fetchStorefrontLandingPage(locale, slug);
}

export async function getStorefrontSitemapLandingPages() {
  'use cache';
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.landingPages);
  const pathname = '/storefront/landing-pages';
  return parseUpstreamJson(await fetchStorefrontUpstream(pathname), pathname, storefrontLandingPageSitemapResponseSchema);
}

async function parseUpstreamJson<T>(
  response: Response,
  pathname: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } },
) {
  if (!response.ok) {
    throw new StorefrontUpstreamError(
      `Storefront API request failed: ${response.status} ${pathname}`,
      {
        code: response.status >= 500 ? 'unavailable' : 'unexpected_status',
        pathname,
        status: response.status,
      },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new StorefrontUpstreamError('Storefront API returned invalid JSON.', {
      code: 'invalid_response',
      pathname,
      status: response.status,
      cause: error,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new StorefrontUpstreamError('Storefront API returned an invalid response contract.', {
      code: 'invalid_response',
      pathname,
      status: response.status,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export async function fetchStorefrontCatalog(
  input: StorefrontProductListQuery,
): Promise<StorefrontProductsResponse> {
  const query = storefrontProductListQuerySchema.parse(input);
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
  });
  if (query.search) params.set('search', query.search);
  if (query.brandId !== null) params.set('brandId', String(query.brandId));
  if (query.categoryId !== null) params.set('categoryId', String(query.categoryId));
  if (query.discounted) params.set('discounted', '1');
  const pathname = `/storefront/products?${params.toString()}`;
  return parseUpstreamJson(await fetchStorefrontUpstream(pathname), pathname, storefrontProductsResponseSchema);
}

export async function fetchStorefrontCatalogMeta(): Promise<{
  brands: StorefrontBrandsResponse['items'];
  categories: StorefrontCategoriesResponse['items'];
}> {
  const [brandsResponse, categoriesResponse] = await Promise.all([
    fetchStorefrontUpstream('/storefront/brands'),
    fetchStorefrontUpstream('/storefront/categories'),
  ]);
  const [brands, categories] = await Promise.all([
    parseUpstreamJson(brandsResponse, '/storefront/brands', storefrontBrandsResponseSchema),
    parseUpstreamJson(categoriesResponse, '/storefront/categories', storefrontCategoriesResponseSchema),
  ]);
  return { brands: brands.items, categories: categories.items };
}

export async function fetchStorefrontEcotrackCatalog(): Promise<StorefrontEcotrackCatalogResponse> {
  return parseUpstreamJson(
    await fetchStorefrontUpstream('/storefront/ecotrack/catalog'),
    '/storefront/ecotrack/catalog',
    storefrontEcotrackCatalogResponseSchema,
  );
}

export async function fetchStorefrontHomepage(): Promise<StorefrontHomepageResponse> {
  const pathname = '/storefront/homepage';
  return parseUpstreamJson(await fetchStorefrontUpstream(pathname), pathname, storefrontHomepageResponseSchema);
}

export async function fetchStorefrontHomepageFeaturedGroupProducts(
  groupId: number,
  input: { page?: number; limit?: number } = {},
): Promise<StorefrontHomepageFeaturedGroupProductsResponse> {
  const query = storefrontHomepageFeaturedGroupProductsQuerySchema.parse(input);
  const pathname = `/storefront/homepage/groups/${groupId}?${new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  }).toString()}`;
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname),
    pathname,
    storefrontHomepageFeaturedGroupProductsResponseSchema,
  );
}

export async function fetchStorefrontSettings(): Promise<StorefrontSettingsResponse> {
  const pathname = '/storefront/settings';
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname),
    pathname,
    storefrontSettingsResponseSchema,
  );
}

export async function fetchStorefrontOrder(
  orderId: number,
  publicToken: string,
): Promise<StorefrontOrderResponseItem | null> {
  if (!Number.isInteger(orderId) || orderId <= 0 || publicToken.trim().length < 20 || publicToken.trim().length > 200) {
    return null;
  }

  const pathname = `/storefront/orders/${orderId}?token=${encodeURIComponent(publicToken.trim())}`;
  const response = await fetchStorefrontUpstream(pathname, { cache: 'no-store', timeoutMs: 6_000 });
  if (response.status === 404) return null;
  const result = await parseUpstreamJson(response, pathname, storefrontReadOrderResponseSchema);
  return result.item;
}

export async function fetchStorefrontOrderByToken(
  publicToken: string,
): Promise<StorefrontOrderResponseItem | null> {
  const token = publicToken.trim();
  if (token.length < 20 || token.length > 200) {
    return null;
  }

  const pathname = `/storefront/orders/track/${encodeURIComponent(token)}`;
  const response = await fetchStorefrontUpstream(pathname, { cache: 'no-store', timeoutMs: 6_000 });
  if (response.status === 404) return null;
  const result = await parseUpstreamJson(response, pathname, storefrontReadOrderResponseSchema);
  return result.item;
}

export async function getStorefrontSettings() {
  'use cache';
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.settings);
  return fetchStorefrontSettings();
}

export async function getStorefrontHomepage() {
  'use cache';
  cacheLife({ stale: 30, revalidate: 120, expire: 600 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.assets, STOREFRONT_NEW_CACHE_TAGS.products, STOREFRONT_NEW_CACHE_TAGS.productMeta);
  return fetchStorefrontHomepage();
}

export async function getStorefrontEcotrackCatalog() {
  // The canonical API caches this shared, low-churn catalog. Keeping this
  // boundary uncached prevents a transient API outage from pinning checkout
  // to an empty delivery selector for the storefront cache lifetime.
  return fetchStorefrontEcotrackCatalog();
}

export async function getStorefrontCatalog(input: StorefrontProductListQuery) {
  'use cache';

  const query = storefrontProductListQuerySchema.parse(input);
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.products);
  return fetchStorefrontCatalog(query);
}

export async function fetchStorefrontSitemapProducts() {
  const query = storefrontProductListQuerySchema.parse({
    page: 1,
    limit: 100,
    search: '',
    brandId: null,
    categoryId: null,
    sortKey: 'updatedAt',
    sortDirection: 'desc',
    id: null,
    mongoId: null,
    slug: null,
  });
  const firstPage = await fetchStorefrontCatalog(query);
  const pageCount = Math.ceil(firstPage.total / query.limit);
  const items = [...firstPage.items];

  for (let page = 2; page <= pageCount; page += 1) {
    const response = await fetchStorefrontCatalog({ ...query, page });
    items.push(...response.items);
  }

  return items;
}

export async function getStorefrontSitemapProducts() {
  'use cache';

  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.products);
  return fetchStorefrontSitemapProducts();
}

export async function getStorefrontCatalogMeta() {
  'use cache';

  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.productMeta);
  return fetchStorefrontCatalogMeta();
}

export async function fetchStorefrontProductDetail(
  value: string,
): Promise<StorefrontProductDetailResponse | null> {
  const parsedToken = storefrontProductTokenSchema.safeParse(value);
  if (!parsedToken.success) {
    throw new StorefrontUpstreamError('Invalid product token.', {
      code: 'invalid_token',
      pathname: '/storefront/products/:token',
    });
  }

  const pathname = `/storefront/products/${encodeURIComponent(parsedToken.data)}`;
  const response = await fetchStorefrontUpstream(pathname);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new StorefrontUpstreamError(
      `Storefront API request failed: ${response.status} ${pathname}`,
      {
        code: response.status >= 500 ? 'unavailable' : 'unexpected_status',
        pathname,
        status: response.status,
      },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new StorefrontUpstreamError('Storefront API returned invalid JSON.', {
      code: 'invalid_response',
      pathname,
      status: response.status,
      cause: error,
    });
  }

  const parsed = storefrontProductDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new StorefrontUpstreamError('Storefront API returned an invalid product contract.', {
      code: 'invalid_response',
      pathname,
      status: response.status,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export async function getStorefrontProductDetail(
  value: string,
): Promise<StorefrontProductDetailResponse | null> {
  'use cache';

  const parsedToken = storefrontProductTokenSchema.parse(value);
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(
    STOREFRONT_NEW_CACHE_TAGS.products,
    getStorefrontProductCacheTag(parsedToken),
  );

  const product = await fetchStorefrontProductDetail(parsedToken);
  if (product) {
    cacheTag(getStorefrontProductCacheTag(product.resolution.canonicalToken));
  }

  return product;
}
