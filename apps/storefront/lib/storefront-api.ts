import {
  defaultStorefrontSettingsResponse,
  storefrontBrandsResponseSchema,
  storefrontAssetsResponseSchema,
  storefrontCategoriesResponseSchema,
  storefrontEcotrackCatalogResponseSchema,
  storefrontHomepageResponseSchema,
  storefrontHomepageFeaturedGroupProductsQuerySchema,
  storefrontHomepageFeaturedGroupProductsResponseSchema,
  storefrontProductDetailResponseSchema,
  storefrontProductPromoResponseSchema,
  storefrontReadOrderResponseSchema,
  storefrontProductListQuerySchema,
  storefrontProductsResponseSchema,
  storefrontSettingsResponseSchema,
  storefrontCartValidationResponseSchema,
  storefrontContentResponseSchema,
  storefrontProductTokenSchema,
  type StorefrontBrandsResponse,
  type StorefrontAssetsResponse,
  type StorefrontCategoriesResponse,
  type StorefrontEcotrackCatalogResponse,
  type StorefrontHomepageResponse,
  type StorefrontHomepageFeaturedGroupProductsResponse,
  type StorefrontProductDetailResponse,
  type StorefrontProductListQueryInput,
  type StorefrontProductsResponse,
  type StorefrontOrderResponseItem,
  type StorefrontSettingsResponse,
  type StorefrontContentResponse,
  STOREFRONT_ANALYTICS_PROJECT,
} from '@bric/storefront-core/contracts';
import {
  landingPageLocaleSchema,
  landingPageSlugSchema,
  storefrontLandingPageResponseSchema,
  storefrontLandingPageSitemapResponseSchema,
  type StorefrontLandingPageResponse,
} from '@bric/storefront-core/landing-pages';
import { unstable_cache } from 'next/cache';

import {
  getStorefrontProductCacheTag,
  getStorefrontLandingPageCacheTag,
  STOREFRONT_CACHE_TAGS,
} from './cache-tags';
import { fetchStorefrontUpstream, StorefrontUpstreamError } from './storefront-upstream';

export async function recordStorefrontAssistantRun(input: {
  telemetry: { journeyId: string; sessionId: string; pagePath: string; intent: string } | undefined;
  locale: 'fr' | 'ar';
  status: 'completed' | 'failed' | 'cancelled';
  mode: 'ai' | 'fallback';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
  toolCalls: number;
  resultsCount: number;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; productIds?: number[] }>;
  response: string;
  promptVersion: string;
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
      intent: input.telemetry.intent,
      status: input.status,
      mode: input.mode,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      toolCalls: Math.max(0, Math.round(input.toolCalls)),
      resultsCount: Math.max(0, Math.round(input.resultsCount)),
      promptVersion: input.promptVersion,
      conversation: input.conversation,
      response: input.response,
    },
  });
  await fetchStorefrontUpstream('/storefront/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    timeoutMs: 2_000,
    cache: 'no-store',
  });
}

async function fetchStorefrontLandingPage(
  locale: string,
  slug: string,
): Promise<StorefrontLandingPageResponse | null> {
  const parsedLocale = landingPageLocaleSchema.parse(locale);
  const parsedSlug = landingPageSlugSchema.parse(slug);
  const pathname = `/storefront/landing-pages/${encodeURIComponent(parsedSlug)}?locale=${parsedLocale}`;
  const response = await fetchStorefrontUpstream(pathname);
  if (response.status === 404) return null;
  return parseUpstreamJson(response, pathname, storefrontLandingPageResponseSchema);
}

export async function getStorefrontLandingPage(locale: string, slug: string) {
  const parsedLocale = landingPageLocaleSchema.parse(locale);
  const parsedSlug = landingPageSlugSchema.parse(slug);
  return unstable_cache(
    () => fetchStorefrontLandingPage(parsedLocale, parsedSlug),
    ['storefront-landing-page', parsedLocale, parsedSlug],
    {
      revalidate: 120,
      tags: [
        STOREFRONT_CACHE_TAGS.landingPages,
        getStorefrontLandingPageCacheTag(parsedLocale, parsedSlug),
      ],
    },
  )();
}

export async function getStorefrontSitemapLandingPages() {
  return unstable_cache(
    async () => {
      const pathname = '/storefront/landing-pages';
      return parseUpstreamJson(
        await fetchStorefrontUpstream(pathname),
        pathname,
        storefrontLandingPageSitemapResponseSchema,
      );
    },
    ['storefront-sitemap-landing-pages'],
    {
      revalidate: 3600,
      tags: [STOREFRONT_CACHE_TAGS.landingPages],
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

export async function fetchStorefrontCartValidation(productIds: number[]) {
  const pathname = '/storefront/products/validate';
  return parseUpstreamJson(
    await fetchStorefrontUpstream(pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productIds }),
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

async function fetchStorefrontEcotrackCatalog(): Promise<StorefrontEcotrackCatalogResponse> {
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

  // During the first blue/green promotion, the storefront image can be built
  // against the previous API release. Public defaults keep that rolling build
  // viable until the candidate API (which owns this route) is promoted first.
  if (response.status === 404) return defaultStorefrontSettingsResponse;

  return parseUpstreamJson(response, pathname, storefrontSettingsResponseSchema);
}

export async function fetchStorefrontContent(
  locale: 'fr' | 'ar',
): Promise<StorefrontContentResponse> {
  const pathname = `/storefront/content?locale=${locale}`;
  const response = await fetchStorefrontUpstream(pathname);
  if (response.status === 404) return { announcement: null };
  return parseUpstreamJson(response, pathname, storefrontContentResponseSchema);
}

export async function fetchStorefrontOrder(
  orderId: number,
  publicToken: string,
): Promise<StorefrontOrderResponseItem | null> {
  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    publicToken.trim().length < 20 ||
    publicToken.trim().length > 200
  ) {
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
  return unstable_cache(
    async () => {
      try {
        return await fetchStorefrontSettings();
      } catch {
        return defaultStorefrontSettingsResponse;
      }
    },
    ['storefront-settings'],
    {
      revalidate: 3600,
      tags: [STOREFRONT_CACHE_TAGS.settings],
    },
  )();
}

export async function getStorefrontContent(locale: 'fr' | 'ar') {
  return unstable_cache(() => fetchStorefrontContent(locale), ['storefront-content', locale], {
    revalidate: 300,
    tags: [STOREFRONT_CACHE_TAGS.settings],
  })();
}

export async function getStorefrontHomepage() {
  return unstable_cache(fetchStorefrontHomepage, ['storefront-homepage'], {
    revalidate: 120,
    tags: [
      STOREFRONT_CACHE_TAGS.assets,
      STOREFRONT_CACHE_TAGS.products,
      STOREFRONT_CACHE_TAGS.productMeta,
    ],
  })();
}

export async function getStorefrontEcotrackCatalog() {
  // The canonical API caches this shared, low-churn catalog. Keeping this
  // boundary uncached prevents a transient API outage from pinning checkout
  // to an empty delivery selector for the storefront cache lifetime.
  return fetchStorefrontEcotrackCatalog();
}

export async function getStorefrontCatalog(input: StorefrontProductListQueryInput) {
  const query = storefrontProductListQuerySchema.parse(input);
  return unstable_cache(
    () => fetchStorefrontCatalog(query),
    ['storefront-catalog', JSON.stringify(query)],
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
  return unstable_cache(fetchStorefrontSitemapProducts, ['storefront-sitemap-products'], {
    revalidate: 3600,
    tags: [STOREFRONT_CACHE_TAGS.products],
  })();
}

export async function getStorefrontCatalogMeta() {
  return unstable_cache(fetchStorefrontCatalogMeta, ['storefront-catalog-meta'], {
    revalidate: 3600,
    tags: [STOREFRONT_CACHE_TAGS.productMeta],
  })();
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
  const parsedToken = storefrontProductTokenSchema.parse(value);
  return unstable_cache(
    () => fetchStorefrontProductDetail(parsedToken),
    ['storefront-product', parsedToken],
    {
      revalidate: 900,
      tags: [STOREFRONT_CACHE_TAGS.products, getStorefrontProductCacheTag(parsedToken)],
    },
  )();
}
