import {
  storefrontBrandsResponseSchema,
  storefrontCategoriesResponseSchema,
  storefrontEcotrackCatalogResponseSchema,
  storefrontProductDetailResponseSchema,
  storefrontProductListQuerySchema,
  storefrontProductsResponseSchema,
  storefrontProductTokenSchema,
  type StorefrontBrandsResponse,
  type StorefrontCategoriesResponse,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontProductDetailResponse,
  type StorefrontProductListQuery,
  type StorefrontProductsResponse,
} from '@bric/storefront-core/contracts';
import { cacheLife, cacheTag } from 'next/cache';

import {
  getStorefrontProductCacheTag,
  STOREFRONT_NEW_CACHE_TAGS,
} from './cache-tags';
import {
  fetchStorefrontUpstream,
  StorefrontUpstreamError,
} from './storefront-upstream';

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

export async function getStorefrontCatalog(input: StorefrontProductListQuery) {
  'use cache';

  const query = storefrontProductListQuerySchema.parse(input);
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(STOREFRONT_NEW_CACHE_TAGS.products);
  return fetchStorefrontCatalog(query);
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
