import {
  defaultStorefrontSettingsResponse,
  STOREFRONT_ANALYTICS_PROJECT,
  storefrontAssetsResponseSchema,
  storefrontBrandsResponseSchema,
  storefrontCartValidationResponseSchema,
  storefrontCategoriesResponseSchema,
  storefrontContentResponseSchema,
  storefrontEcotrackCatalogResponseSchema,
  storefrontHomepageFeaturedGroupProductsQuerySchema,
  storefrontHomepageFeaturedGroupProductsResponseSchema,
  storefrontHomepageResponseSchema,
  storefrontProductDetailResponseSchema,
  storefrontProductListQuerySchema,
  storefrontProductPromoResponseSchema,
  storefrontProductsResponseSchema,
  storefrontProductTokenSchema,
  storefrontReadOrderResponseSchema,
  storefrontSettingsResponseSchema,
  type StorefrontAssetsResponse,
  type StorefrontBrandsResponse,
  type StorefrontCategoriesResponse,
  type StorefrontContentResponse,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontHomepageFeaturedGroupProductsResponse,
  type StorefrontHomepageResponse,
  type StorefrontOrderResponseItem,
  type StorefrontProductDetailResponse,
  type StorefrontProductListQueryInput,
  type StorefrontProductsResponse,
  type StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';
import {
  landingPageLocaleSchema,
  landingPagePreviewSchema,
  landingPageSlugSchema,
  storefrontLandingPageResponseSchema,
  type LandingPagePreview,
  type StorefrontLandingPageResponse,
} from '@bric/storefront-core/landing-pages';
import { unstable_cache } from 'next/cache';

import {
  getStorefrontLandingPageCacheTag,
  getStorefrontProductCacheTag,
  STOREFRONT_CACHE_TAGS,
} from './cache-tags';
import {
  fetchStorefrontUpstream,
  getStorefrontApiBaseUrl,
  StorefrontUpstreamError,
} from './storefront-upstream';

export async function recordStorefrontAssistantRun(input: {
  telemetry: { journeyId: string; sessionId: string; pagePath: string } | undefined;
  locale: 'fr' | 'ar';
  status: 'completed' | 'failed' | 'cancelled';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
  toolCalls: number;
  toolNames: string[];
  resultsCount: number;
  cartChanges: number;
  promptVersion: string;
  errorCode?: string;
}) {
  if (!input.telemetry) return;
  const body = JSON.stringify({
    eventVersion: 1,
    eventId: crypto.randomUUID(),
    journeyId: input.telemetry.journeyId,
    sessionId: input.telemetry.sessionId,
    eventName: 'ai_assistant_run',
    occurredAt: new Date().toISOString(),
    pagePath: input.telemetry.pagePath,
    pageType: 'global_navigation',
    locale: input.locale,
    currency: 'DZD',
    metadata: {
      storefrontProject: STOREFRONT_ANALYTICS_PROJECT,
      status: input.status,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      toolCalls: Math.max(0, Math.round(input.toolCalls)),
      toolNames: [...new Set(input.toolNames)].slice(0, 12),
      resultsCount: Math.max(0, Math.round(input.resultsCount)),
      cartChanges: Math.max(0, Math.round(input.cartChanges)),
      promptVersion: input.promptVersion,
      errorCode: input.errorCode ?? null,
    },
  });
  await fetchStorefrontUpstream('/storefront/analytics', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-storefront-meta-proxy-secret': process.env.STOREFRONT_META_PROXY_SECRET ?? '',
    },
    body,
    timeoutMs: 2_000,
    cache: 'no-store',
  });
}

export function buildStorefrontLandingPagePath(
  locale: string,
  slug: string,
  preview?: LandingPagePreview,
) {
  const parsedLocale = landingPageLocaleSchema.parse(locale);
  const parsedSlug = landingPageSlugSchema.parse(slug);
  const params = new URLSearchParams({ locale: parsedLocale });
  if (preview) {
    const parsedPreview = landingPagePreviewSchema.parse(preview);
    params.set('previewRevision', String(parsedPreview.revision));
    params.set('previewTimestamp', parsedPreview.timestamp);
    params.set('previewSignature', parsedPreview.signature);
  }
  return `/storefront/landing-pages/${encodeURIComponent(parsedSlug)}?${params.toString()}`;
}

async function fetchStorefrontLandingPage(
  locale: string,
  slug: string,
  preview?: LandingPagePreview,
): Promise<StorefrontLandingPageResponse | null> {
  const pathname = buildStorefrontLandingPagePath(locale, slug, preview);
  const response = await fetchStorefrontUpstream(pathname, preview ? { cache: 'no-store' } : {});
  if (response.status === 404) return null;
  return parseUpstreamJson(response, pathname, storefrontLandingPageResponseSchema);
}

export async function getStorefrontLandingPage(
  locale: string,
  slug: string,
  preview?: LandingPagePreview,
) {
  const parsedLocale = landingPageLocaleSchema.parse(locale);
  const parsedSlug = landingPageSlugSchema.parse(slug);
  if (preview) {
    const parsedPreview = landingPagePreviewSchema.parse(preview);
    return fetchStorefrontLandingPage(parsedLocale, parsedSlug, parsedPreview);
  }
  return unstable_cache(
    () => fetchStorefrontLandingPage(parsedLocale, parsedSlug),
    ['storefront-landing-page', getStorefrontApiBaseUrl(), parsedLocale, parsedSlug],
    {
      revalidate: 120,
      tags: [
        STOREFRONT_CACHE_TAGS.landingPages,
        getStorefrontLandingPageCacheTag(parsedLocale, parsedSlug),
      ],
    },
  )();
}

async function parseUpstreamJson<T>(
  response: Response,
  pathname: string,
  schema: {
    safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown };
  },
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
  input: StorefrontProductListQueryInput,
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
  if (query.stock !== 'all') params.set('stock', query.stock);
  if (query.minPrice !== null) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== null) params.set('maxPrice', String(query.maxPrice));
  const pathname = `/storefront/products?${params.toString()}`;
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname),
    pathname,
    storefrontProductsResponseSchema,
  );
}

export async function fetchStorefrontCartValidation(
  productIds: number[],
  promoCode?: string | null,
  productPromos?: Array<{ productId: number; code: string }>,
) {
  const pathname = '/storefront/products/validate';
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productIds,
        ...(promoCode ? { promoCode } : {}),
        ...(productPromos ? { productPromos } : {}),
      }),
      cache: 'no-store',
    }),
    pathname,
    storefrontCartValidationResponseSchema,
  );
}

export async function fetchStorefrontProductPromo(productId: number, code: string) {
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new StorefrontUpstreamError('Invalid product id.', {
      code: 'invalid_token',
      pathname: '/storefront/products/:id/promo',
    });
  }
  const normalizedCode = code.trim();
  if (!normalizedCode || normalizedCode.length > 120) {
    throw new StorefrontUpstreamError('Invalid promotion code.', {
      code: 'invalid_token',
      pathname: `/storefront/products/${productId}/promo`,
    });
  }

  const pathname = `/storefront/products/${productId}/promo?code=${encodeURIComponent(normalizedCode)}`;
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname, { cache: 'no-store' }),
    pathname,
    storefrontProductPromoResponseSchema,
  );
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
    parseUpstreamJson(
      categoriesResponse,
      '/storefront/categories',
      storefrontCategoriesResponseSchema,
    ),
  ]);
  return { brands: brands.items, categories: categories.items };
}

export async function getStorefrontEcotrackCatalog(): Promise<StorefrontEcotrackCatalogResponse> {
  return parseUpstreamJson(
    await fetchStorefrontUpstream('/storefront/ecotrack/catalog'),
    '/storefront/ecotrack/catalog',
    storefrontEcotrackCatalogResponseSchema,
  );
}

export async function fetchStorefrontHomepage(): Promise<StorefrontHomepageResponse> {
  const pathname = '/storefront/homepage';
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname),
    pathname,
    storefrontHomepageResponseSchema,
  );
}

export async function fetchStorefrontAssets(): Promise<StorefrontAssetsResponse> {
  const pathname = '/storefront/assets';
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname),
    pathname,
    storefrontAssetsResponseSchema,
  );
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
  const response = await fetchStorefrontUpstream(pathname);

  return parseUpstreamJson(response, pathname, storefrontSettingsResponseSchema);
}

async function fetchStorefrontContent(locale: 'fr' | 'ar'): Promise<StorefrontContentResponse> {
  const pathname = `/storefront/content?locale=${locale}`;
  const response = await fetchStorefrontUpstream(pathname);
  if (response.status === 404) return { announcement: null };
  return parseUpstreamJson(response, pathname, storefrontContentResponseSchema);
}

export async function fetchStorefrontOrderByToken(
  publicToken: string,
): Promise<StorefrontOrderResponseItem | null> {
  const token = publicToken.trim();
  if (token.length < 20 || token.length > 200) {
    return null;
  }

  const pathname = '/storefront/orders/track';
  const response = await fetchStorefrontUpstream(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
    timeoutMs: 6_000,
  });
  if (response.status === 404) return null;
  const result = await parseUpstreamJson(response, pathname, storefrontReadOrderResponseSchema);
  return result.item;
}

export async function getStorefrontSettings() {
  // Defaults keep browsing available, but must not enter the shared cache or
  // override the assistant's requirement for verified settings.
  return getRequiredStorefrontSettings().catch(() => defaultStorefrontSettingsResponse);
}

export async function getRequiredStorefrontSettings() {
  return unstable_cache(
    fetchStorefrontSettings,
    ['storefront-settings', getStorefrontApiBaseUrl()],
    {
      revalidate: 3600,
      tags: [STOREFRONT_CACHE_TAGS.settings],
    },
  )();
}

export async function getStorefrontContent(locale: 'fr' | 'ar') {
  return unstable_cache(
    () => fetchStorefrontContent(locale),
    ['storefront-content', getStorefrontApiBaseUrl(), locale],
    {
      revalidate: 300,
      tags: [STOREFRONT_CACHE_TAGS.settings],
    },
  )();
}

export async function getStorefrontHomepage() {
  return unstable_cache(
    fetchStorefrontHomepage,
    ['storefront-homepage', getStorefrontApiBaseUrl()],
    {
      revalidate: 120,
      tags: [
        STOREFRONT_CACHE_TAGS.assets,
        STOREFRONT_CACHE_TAGS.products,
        STOREFRONT_CACHE_TAGS.productMeta,
      ],
    },
  )();
}

export async function getStorefrontCatalog(input: StorefrontProductListQueryInput) {
  const query = storefrontProductListQuerySchema.parse(input);
  return unstable_cache(
    () => fetchStorefrontCatalog(query),
    ['storefront-catalog', getStorefrontApiBaseUrl(), JSON.stringify(query)],
    { revalidate: 60, tags: [STOREFRONT_CACHE_TAGS.products] },
  )();
}

export async function fetchStorefrontSitemapProducts() {
  const query = storefrontProductListQuerySchema.parse({
    page: 1,
    limit: 100,
    search: '',
    brandId: null,
    categoryId: null,
    stock: 'all',
    minPrice: null,
    maxPrice: null,
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
  return unstable_cache(
    fetchStorefrontSitemapProducts,
    ['storefront-sitemap-products', getStorefrontApiBaseUrl()],
    {
      revalidate: 3600,
      tags: [STOREFRONT_CACHE_TAGS.products],
    },
  )();
}

export async function getStorefrontCatalogMeta() {
  return unstable_cache(
    fetchStorefrontCatalogMeta,
    ['storefront-catalog-meta', getStorefrontApiBaseUrl()],
    {
      revalidate: 3600,
      tags: [STOREFRONT_CACHE_TAGS.productMeta],
    },
  )();
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

  return parseUpstreamJson(response, pathname, storefrontProductDetailResponseSchema);
}

export async function getStorefrontProductDetail(
  value: string,
): Promise<StorefrontProductDetailResponse | null> {
  const parsedToken = storefrontProductTokenSchema.parse(value);
  return unstable_cache(
    () => fetchStorefrontProductDetail(parsedToken),
    ['storefront-product', getStorefrontApiBaseUrl(), parsedToken],
    {
      revalidate: 900,
      tags: [STOREFRONT_CACHE_TAGS.products, getStorefrontProductCacheTag(parsedToken)],
    },
  )();
}
