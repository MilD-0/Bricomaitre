import { unstable_cache } from "next/cache";

import {
  buildFeaturedProductIds,
  buildLegacyFilters,
  fetchLegacyProductByTokenFromSource,
  fetchLegacyProductsByTokensFromSource,
  fetchLegacyProductsPageFromSource,
  normalizeBanner,
  normalizeBrand,
  normalizeCategory,
  normalizeFeaturedGroup,
  normalizeFeaturedGroupLink,
  normalizeProduct,
  matchesSearch,
  resolveCategoryIds,
  sortLegacyProducts,
  sortLegacyProductsForNewest,
  filterProductsByIds,
  buildFeaturedGroupProducts,
  findBrandByToken,
  findCategoryByToken,
  findDeliveryFee,
  findWilayaByName,
  getCommunesForWilaya,
  type CatalogContext,
  type LegacyBrand,
  type LegacyCategory,
  type LegacyFeaturedGroup,
  type LegacyHomepageData,
  type LegacyProduct,
  type LegacyProductsPageParams,
  type LegacyProductsPageResult,
  type StorefrontAssets,
  type StorefrontBrand,
  type StorefrontCategory,
  type StorefrontEcotrackCatalog,
  type StorefrontProduct,
} from "@bric/storefront-core/legacy-adapter";

import {
  StorefrontUpstreamError,
  fetchStorefrontJson,
} from "@/lib/storefront-upstream";

const DEFAULT_PAGE_SIZE = 100;

const EMPTY_STOREFRONT_ASSETS: StorefrontAssets = {
  banners: [],
  featuredGroups: [],
  productCards: [],
};

const EMPTY_ECOTRACK_CATALOG: StorefrontEcotrackCatalog = {
  wilayas: [],
  communes: [],
  serviceFees: [],
  weightFees: [],
  lastSync: null,
};

export type AutocompleteProductEntry = {
  product: LegacyProduct;
  titleNormalized: string;
  titleArNormalized: string;
  tokenPrefixes: string[];
  searchableText: string;
};

async function storefrontFetchJson<T>(
  pathname: string,
  init?: RequestInit & { next?: { revalidate?: number; tags?: string[] } },
): Promise<T> {
  return fetchStorefrontJson<T>(pathname, init);
}

async function withStorefrontFallback<T>(
  pathname: string,
  fallback: T,
  load: () => Promise<T>,
) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof StorefrontUpstreamError) {
      const phaseLabel = isNextProductionBuildPhase() ? "build" : "runtime";
      console.error(
        `[storefront-old] upstream request failed for ${pathname} during ${phaseLabel}`,
        error.message,
      );
      return fallback;
    }

    throw error;
  }
}

export function isNextProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export async function fetchStorefrontBrands() {
  return withStorefrontFallback("/api/storefront/brands", [] as StorefrontBrand[], async () => {
    const data = await storefrontFetchJson<{ items: StorefrontBrand[] }>(
      "/api/storefront/brands",
      { next: { revalidate: 300 } },
    );
    return data.items;
  });
}

export async function fetchStorefrontCategories() {
  return withStorefrontFallback(
    "/api/storefront/categories",
    [] as StorefrontCategory[],
    async () => {
      const data = await storefrontFetchJson<{ items: StorefrontCategory[] }>(
        "/api/storefront/categories",
        { next: { revalidate: 300 } },
      );
      return data.items;
    },
  );
}

export async function fetchStorefrontAssets() {
  return withStorefrontFallback("/api/storefront/assets", EMPTY_STOREFRONT_ASSETS, () =>
    storefrontFetchJson<StorefrontAssets>("/api/storefront/assets", {
      next: { revalidate: 300 },
    }),
  );
}

export async function fetchStorefrontEcotrackCatalog() {
  return withStorefrontFallback(
    "/api/storefront/ecotrack/catalog",
    EMPTY_ECOTRACK_CATALOG,
    () =>
      storefrontFetchJson<StorefrontEcotrackCatalog>("/api/storefront/ecotrack/catalog", {
        next: { revalidate: 300 },
      }),
  );
}

export async function fetchStorefrontProductsPage(params: {
  page?: number;
  limit?: number;
  id?: string | number | null;
  mongoId?: string | null;
  search?: string;
  categoryId?: string | number | null;
  brandId?: string | number | null;
  sortKey?: string;
  sortDirection?: string;
  slug?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.id != null && params.id !== "") {
    searchParams.set("id", String(params.id));
  }
  if (params.mongoId) {
    searchParams.set("mongoId", params.mongoId);
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.categoryId != null && params.categoryId !== "") {
    searchParams.set("categoryId", String(params.categoryId));
  }
  if (params.brandId != null && params.brandId !== "") {
    searchParams.set("brandId", String(params.brandId));
  }
  if (params.sortKey) {
    searchParams.set("sortKey", params.sortKey);
  }
  if (params.sortDirection) {
    searchParams.set("sortDirection", params.sortDirection);
  }
  if (params.slug) {
    searchParams.set("slug", params.slug);
  }

  const query = searchParams.toString();
  const pathname = `/api/storefront/products${query ? `?${query}` : ""}`;

  return withStorefrontFallback(pathname, [] as StorefrontProduct[], async () => {
    const data = await storefrontFetchJson<{ items: StorefrontProduct[] }>(pathname, {
      next: { revalidate: 60 },
    });
    return data.items;
  });
}

export async function listAllStorefrontProducts(filters?: {
  search?: string;
  categoryId?: string | number | null;
  brandId?: string | number | null;
  sortKey?: string;
  sortDirection?: string;
}) {
  const items: StorefrontProduct[] = [];
  let page = 1;

  while (true) {
    const pageItems = await fetchStorefrontProductsPage({
      page,
      limit: DEFAULT_PAGE_SIZE,
      ...filters,
    });

    items.push(...pageItems);

    if (pageItems.length < DEFAULT_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return items;
}

const getCachedCatalogContext = unstable_cache(
  async (): Promise<CatalogContext> => {
    const [brands, categories, assets] = await Promise.all([
      fetchStorefrontBrands(),
      fetchStorefrontCategories(),
      fetchStorefrontAssets(),
    ]);

    return { brands, categories, assets };
  },
  ["storefront-old-catalog-context"],
  { revalidate: 300 },
);

export async function fetchCatalogContext(): Promise<CatalogContext> {
  return getCachedCatalogContext();
}

export async function fetchLegacyFilters() {
  const context = await fetchCatalogContext();
  return buildLegacyFilters(context.categories, context.brands);
}

export async function fetchLegacyProductByToken(id: string) {
  return fetchLegacyProductByTokenFromSource(
    id,
    await fetchCatalogContext(),
    fetchStorefrontProductsPage,
  );
}

export async function fetchLegacyProductsByTokens(ids: Array<string | number>) {
  return fetchLegacyProductsByTokensFromSource(
    ids,
    await fetchCatalogContext(),
    fetchStorefrontProductsPage,
  );
}

export async function fetchLegacyProductsPage(
  params: LegacyProductsPageParams = {},
): Promise<LegacyProductsPageResult> {
  return fetchLegacyProductsPageFromSource(
    params,
    await fetchCatalogContext(),
    fetchStorefrontProductsPage,
    listAllStorefrontProducts,
  );
}

export {
  buildFeaturedGroupProducts,
  buildFeaturedProductIds,
  filterProductsByIds,
  findBrandByToken,
  findCategoryByToken,
  findDeliveryFee,
  findWilayaByName,
  getCommunesForWilaya,
  matchesSearch,
  normalizeBanner,
  normalizeBrand,
  normalizeCategory,
  normalizeFeaturedGroup,
  normalizeFeaturedGroupLink,
  normalizeProduct,
  resolveCategoryIds,
  sortLegacyProducts,
  sortLegacyProductsForNewest,
};

export type {
  LegacyBrand,
  LegacyCategory,
  LegacyFeaturedGroup,
  LegacyHomepageData,
  LegacyProduct,
  LegacyProductsPageParams,
  LegacyProductsPageResult,
  StorefrontAssets,
  StorefrontBrand,
  StorefrontCategory,
  StorefrontEcotrackCatalog,
  StorefrontProduct,
};
