import { unstable_cache } from "next/cache";
import {
  StorefrontUpstreamError,
  fetchStorefrontJson,
} from "@/lib/storefront-upstream";
import { STOREFRONT_CACHE_TAGS } from "@/lib/cache-tags";

const DEFAULT_PAGE_SIZE = 100;

type StorefrontProduct = {
  id: number;
  slug: string | null;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  sku: string | null;
  barcode: string | null;
  price: string | null;
  oldPrice: string | null;
  active: boolean;
  inStock: boolean;
  availabilityStatus: string;
  inventoryQuantity: number;
  brandId: number | null;
  categoryId: number | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
};

type StorefrontProductBuildFeedItem = {
  id: number;
  slug: string | null;
  updatedAt: string;
};

type StorefrontBrand = {
  id: number;
  name: string;
  slug: string | null;
  image: string | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

type StorefrontCategory = {
  id: number;
  name: string;
  slug: string | null;
  nameEn: string | null;
  nameAr: string | null;
  image: string | null;
  parentId: number | null;
  properties: unknown[];
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

type StorefrontBanner = {
  id: number;
  title: string;
  titleAr: string | null;
  imageUrl: string;
  productId: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type StorefrontFeaturedGroup = {
  id: number;
  name: string;
  nameAr: string | null;
  cta: string | null;
  ctaAr: string | null;
  link: string | null;
  sortOrder: number;
  showAtTopOfProductsPage: boolean;
  active: boolean;
  productIds: number[];
  brandIds: number[];
  categoryIds: number[];
  createdAt: string;
  updatedAt: string;
};

type StorefrontProductCard = {
  id: number;
  productId: number;
  titleAr: string;
  titleFr: string;
  descriptionAr: string;
  descriptionFr: string;
  characteristicsAr: string[];
  characteristicsFr: string[];
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LegacyStorefrontBanner = {
  _id: string;
  id: number;
  title: string;
  titleAr: string | null;
  image: string;
  link: string;
  createdAt: string;
  updatedAt: string;
};

export type LegacyFeaturedGroup = {
  _id: string;
  id: number;
  title: string;
  titleAr: string | null;
  cta: string | null;
  ctaAr: string | null;
  link: string | null;
  products: LegacyProduct[];
};

export type LegacyHomepageFeaturedGroup = {
  _id: string;
  id: number;
  title: string;
  titleAr: string | null;
  cta: string | null;
  ctaAr: string | null;
  link: string | null;
};

export type LegacyHomepageData = {
  banners: LegacyStorefrontBanner[];
  featuredGroups: LegacyHomepageFeaturedGroup[];
  cards: LegacyProduct[];
  brands: LegacyBrand[];
};

type StorefrontAssets = {
  banners: StorefrontBanner[];
  featuredGroups: StorefrontFeaturedGroup[];
  productCards: StorefrontProductCard[];
};

type StorefrontEcotrackCatalog = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{
    communeId: number;
    wilayaId: number;
    name: string;
    postalCode: string | null;
    hasStopDesk: boolean;
  }>;
  serviceFees: Array<{
    serviceType: string;
    wilayaId: number;
    homeFee: string;
    stopDeskFee: string;
  }>;
  weightFees: Array<{
    serviceType: string;
    homeSurcharge: string;
    stopDeskSurcharge: string;
    perAdditionalKg: string;
    startsAtKg: string;
  }>;
  lastSync: unknown | null;
};

export type LegacyBrand = {
  _id: string;
  id: number;
  slug: string | null;
  name: string;
  image: string | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LegacyCategory = {
  _id: string;
  id: number;
  slug: string | null;
  name: string;
  name_en: string;
  name_ar: string;
  image: string | null;
  parent: string | null;
  featured: boolean;
  properties: unknown[];
  createdAt: string;
  updatedAt: string;
  children?: LegacyCategory[];
};

export type LegacyProduct = {
  _id: string;
  id: number;
  slug: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  summary: string;
  summary_ar: string;
  features: string[];
  features_ar: string[];
  images: string[];
  price: number;
  OldPrice: number | null;
  oldPrice: number | null;
  stock: number;
  inStock: boolean;
  availabilityStatus: string;
  inventoryQuantity: number;
  brand: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  brandInfo: LegacyBrand | null;
  categoryInfo: LegacyCategory | null;
  parentCategoryInfo: LegacyCategory | null;
  specValues: string[];
  specIcons: string[];
  specDescs: string[];
  specDescs_ar: string[];
  summary2: string;
  summary2_ar: string;
  color: string;
  ShowPercentage: number;
  createdAt: string;
  updatedAt: string;
};

export type AutocompleteProductEntry = {
  product: LegacyProduct;
  titleNormalized: string;
  titleArNormalized: string;
  tokenPrefixes: string[];
  searchableText: string;
};

export type StorefrontWilaya = {
  wilayaId: number;
  name: string;
};

export type StorefrontCommune = {
  communeId: number;
  wilayaId: number;
  name: string;
  postalCode: string | null;
  hasStopDesk: boolean;
};

type CatalogContext = {
  brands: StorefrontBrand[];
  categories: StorefrontCategory[];
  assets: StorefrontAssets;
};

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

export type LegacyProductsPageParams = {
  page?: number;
  limit?: number;
  search?: string;
  category?: string | null;
  childCategory?: string | null;
  brand?: string | null;
  instock?: boolean;
  sortby?: string | null;
  slug?: string | null;
};

export type LegacyProductsPageResult = {
  products: LegacyProduct[];
  pagination: {
    currentPage: number;
    totalPages: number | null;
    totalCount: number | null;
    hasMore: boolean;
    hasPrevious: boolean;
    limit: number;
  };
  filters: {
    brands: LegacyBrand[];
    categories: LegacyCategory[];
  };
};

async function storefrontFetchJson<T>(
  pathname: string,
  init?: RequestInit & { next?: { revalidate?: number } },
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
      console.error(`[storefront] upstream request failed for ${pathname} during ${phaseLabel}`, error.message);
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
  return withStorefrontFallback("/api/storefront/categories", [] as StorefrontCategory[], async () => {
    const data = await storefrontFetchJson<{ items: StorefrontCategory[] }>(
      "/api/storefront/categories",
      { next: { revalidate: 300 } },
    );
    return data.items;
  });
}

export async function fetchStorefrontAssets() {
  return withStorefrontFallback("/api/storefront/assets", EMPTY_STOREFRONT_ASSETS, () =>
    storefrontFetchJson<StorefrontAssets>("/api/storefront/assets", {
      next: { revalidate: 300, tags: [STOREFRONT_CACHE_TAGS.assets] },
    }),
  );
}

export async function fetchStorefrontProductBuildFeed() {
  return withStorefrontFallback("/api/storefront/products/build-feed", [] as StorefrontProductBuildFeedItem[], async () => {
    const data = await storefrontFetchJson<{ items: StorefrontProductBuildFeedItem[] }>(
      "/api/storefront/products/build-feed",
      { next: { revalidate: 60, tags: [STOREFRONT_CACHE_TAGS.buildFeed] } },
    );
    return data.items;
  });
}

export async function fetchStorefrontEcotrackCatalog() {
  return withStorefrontFallback(
    "/api/storefront/ecotrack/catalog",
    EMPTY_ECOTRACK_CATALOG,
    () =>
      storefrontFetchJson<StorefrontEcotrackCatalog>(
        "/api/storefront/ecotrack/catalog",
        { next: { revalidate: 300 } },
      ),
  );
}

export async function fetchStorefrontProductsPage(params: {
  page?: number;
  limit?: number;
  id?: string | number | null;
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
    const data = await storefrontFetchJson<{ items: StorefrontProduct[] }>(
      pathname,
      { next: { revalidate: 60 } },
    );
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

export async function fetchCatalogContext(): Promise<CatalogContext> {
  return getCachedCatalogContext();
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
  ["storefront-catalog-context"],
  { revalidate: 300, tags: [STOREFRONT_CACHE_TAGS.catalogContext, STOREFRONT_CACHE_TAGS.assets] },
);

export function normalizeBrand(brand: StorefrontBrand): LegacyBrand {
  return {
    _id: String(brand.id),
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    image: brand.image,
    featured: brand.featured,
    createdAt: brand.createdAt,
    updatedAt: brand.updatedAt,
  };
}

export function normalizeCategory(category: StorefrontCategory): LegacyCategory {
  return {
    _id: String(category.id),
    id: category.id,
    slug: category.slug,
    name: category.name,
    name_en: category.nameEn ?? "",
    name_ar: category.nameAr ?? "",
    image: category.image,
    parent: category.parentId == null ? null : String(category.parentId),
    featured: category.featured,
    properties: category.properties ?? [],
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export function withCategoryChildren(categories: LegacyCategory[]) {
  return categories.map((category) => ({
    ...category,
    children: categories.filter((child) => child.parent === category._id),
  }));
}

export function normalizeProduct(
  product: StorefrontProduct,
  context?: Partial<CatalogContext>,
): LegacyProduct {
  const brand = context?.brands?.find((item) => item.id === product.brandId) ?? null;
  const category =
    context?.categories?.find((item) => item.id === product.categoryId) ?? null;
  const parentCategory =
    category?.parentId == null
      ? null
      : context?.categories?.find((item) => item.id === category.parentId) ?? null;
  const productCard =
    context?.assets?.productCards?.find((item) => item.productId === product.id) ?? null;

  const price = Number(product.price ?? 0);
  const oldPrice = product.oldPrice == null ? null : Number(product.oldPrice);

  return {
    _id: String(product.id),
    id: product.id,
    slug: product.slug ?? String(product.id),
    title: product.title,
    title_ar: product.titleAr ?? productCard?.titleAr ?? "",
    description: product.description ?? productCard?.descriptionFr ?? "",
    description_ar: product.descriptionAr ?? productCard?.descriptionAr ?? "",
    summary: productCard?.descriptionFr ?? product.description ?? "",
    summary_ar: productCard?.descriptionAr ?? product.descriptionAr ?? "",
    features: productCard?.characteristicsFr ?? [],
    features_ar: productCard?.characteristicsAr ?? [],
    images: product.images ?? [],
    price,
    OldPrice: oldPrice,
    oldPrice,
    stock: product.inStock ? Math.max(product.inventoryQuantity ?? 0, 1) : 0,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    inventoryQuantity: product.inventoryQuantity,
    brand: product.brandId == null ? null : String(product.brandId),
    category: product.categoryId == null ? null : String(product.categoryId),
    sku: product.sku,
    barcode: product.barcode,
    brandInfo: brand ? normalizeBrand(brand) : null,
    categoryInfo: category ? normalizeCategory(category) : null,
    parentCategoryInfo: parentCategory ? normalizeCategory(parentCategory) : null,
    specValues: [],
    specIcons: [],
    specDescs: [],
    specDescs_ar: [],
    summary2: "",
    summary2_ar: "",
    color: "#111827",
    ShowPercentage: 1,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function normalizeAutocompleteText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeAutocompleteText(value?: string | null) {
  return normalizeAutocompleteText(value)
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const getCachedAutocompleteProducts = unstable_cache(
  async (): Promise<AutocompleteProductEntry[]> => {
    const context = await fetchCatalogContext();
    const products = (await listAllStorefrontProducts()).map((product) =>
      normalizeProduct(product, context),
    );

    return products.map((product) => {
      const tokenPrefixes = Array.from(
        new Set([
          ...tokenizeAutocompleteText(product.title),
          ...tokenizeAutocompleteText(product.title_ar),
          ...tokenizeAutocompleteText(product.brandInfo?.name),
          ...tokenizeAutocompleteText(product.categoryInfo?.name),
          ...tokenizeAutocompleteText(product.categoryInfo?.name_ar),
          ...tokenizeAutocompleteText(product.sku),
          ...tokenizeAutocompleteText(product.barcode),
        ]),
      );

      return {
        product,
        titleNormalized: normalizeAutocompleteText(product.title),
        titleArNormalized: normalizeAutocompleteText(product.title_ar),
        tokenPrefixes,
        searchableText: normalizeAutocompleteText(
          [
            product.title,
            product.title_ar,
            product.brandInfo?.name,
            product.categoryInfo?.name,
            product.categoryInfo?.name_ar,
            product.sku,
            product.barcode,
          ].join(" "),
        ),
      };
    });
  },
  ["storefront-autocomplete-products"],
  { revalidate: 300 },
);

export async function fetchAutocompleteProducts() {
  return getCachedAutocompleteProducts();
}

export function normalizeBanner(
  banner: StorefrontBanner,
  products: StorefrontProduct[],
): LegacyStorefrontBanner {
  const linkedProduct =
    banner.productId == null
      ? null
      : products.find((product) => product.id === banner.productId) ?? null;

  return {
    _id: String(banner.id),
    id: banner.id,
    title: banner.title,
    titleAr: banner.titleAr,
    image: banner.imageUrl,
    link: linkedProduct ? buildLandingProductHref({
      _id: String(linkedProduct.id),
      slug: linkedProduct.slug ?? String(linkedProduct.id),
    }) : "/products",
    createdAt: banner.createdAt,
    updatedAt: banner.updatedAt,
  };
}

export function normalizeFeaturedGroupLink(link: string | null) {
  if (!link) {
    return null;
  }

  if (link.startsWith("#")) {
    return link;
  }

  try {
    const url = new URL(link);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return link;
    }
  } catch {}

  if (!link.startsWith("/")) {
    return link;
  }

  const match = link.match(/^\/(fr|ar)(\/.*|$)/);
  if (!match) {
    return link;
  }

  const suffix = match[2] || "";
  return suffix.length > 0 ? suffix : "/";
}

function normalizeHomepageFeaturedGroup(
  group: StorefrontFeaturedGroup,
): LegacyHomepageFeaturedGroup {
  return {
    _id: String(group.id),
    id: group.id,
    title: group.name,
    titleAr: group.nameAr,
    cta: group.cta,
    ctaAr: group.ctaAr,
    link: normalizeFeaturedGroupLink(group.link),
  };
}

export function buildFeaturedProductIds(assets: StorefrontAssets) {
  const ids = new Set<number>();

  assets.featuredGroups.forEach((group) => {
    group.productIds.forEach((productId) => ids.add(productId));
  });

  return Array.from(ids);
}

export function sortStorefrontBanners(banners: StorefrontBanner[]) {
  return [...banners].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function sortStorefrontFeaturedGroups(groups: StorefrontFeaturedGroup[]) {
  return [...groups].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function sortStorefrontProductCards(cards: StorefrontProductCard[]) {
  return [...cards].sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function buildHomepageData(): Promise<LegacyHomepageData> {
  return getCachedHomepageData();
}

const getCachedHomepageData = unstable_cache(
  async (): Promise<LegacyHomepageData> => {
    const context = await fetchCatalogContext();
    const activeBanners = sortStorefrontBanners(context.assets.banners);
    const activeProductCards = sortStorefrontProductCards(context.assets.productCards).filter(
      (card) => card.active,
    );
    const homepageProductIds = Array.from(
      new Set(
        [
          ...activeBanners.map((banner) => banner.productId).filter((id): id is number => id != null),
          ...activeProductCards.map((card) => card.productId),
        ],
      ),
    );
    const rawHomepageProducts = (
      await Promise.all(
        homepageProductIds.map((id) =>
          fetchStorefrontProductsPage({ id, limit: 1 }).then((items) => items[0] ?? null),
        ),
      )
    ).filter((product): product is StorefrontProduct => Boolean(product));
    const products = rawHomepageProducts.map((product) => normalizeProduct(product, context));

    const banners = activeBanners.map((banner) =>
      normalizeBanner(banner, rawHomepageProducts),
    );
    const featuredGroups = sortStorefrontFeaturedGroups(context.assets.featuredGroups)
      .filter((group) => group.active)
      .map(normalizeHomepageFeaturedGroup);
    const productById = new Map(products.map((product) => [product._id, product]));
    const cards = activeProductCards
      .map((card) => productById.get(String(card.productId)) ?? null)
      .filter((product): product is LegacyProduct => Boolean(product));

    return {
      banners,
      featuredGroups,
      cards,
      brands: context.brands.map(normalizeBrand),
    };
  },
  ["storefront-homepage-data"],
  { revalidate: 300 },
);

const getCachedHomepageFeaturedGroupCatalog = unstable_cache(
  async () => {
    const context = await fetchCatalogContext();
    const rawProducts = await listAllStorefrontProducts();

    return {
      assets: context.assets,
      products: rawProducts.map((product) => normalizeProduct(product, context)),
    };
  },
  ["storefront-homepage-featured-group-catalog"],
  { revalidate: 300 },
);

export async function fetchHomepageFeaturedGroup(
  id: string | number,
): Promise<LegacyFeaturedGroup | null> {
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }

  const { assets, products } = await getCachedHomepageFeaturedGroupCatalog();
  const group = assets.featuredGroups.find((item) => item.active && item.id === numericId) ?? null;

  if (!group) {
    return null;
  }

  const normalized = normalizeFeaturedGroup(group, products);

  return normalized.products.length > 0 ? normalized : null;
}

function mapSortParams(sortby?: string | null) {
  switch (sortby) {
    case "price":
      return { sortKey: "price", sortDirection: "asc" } as const;
    case "-price":
      return { sortKey: "price", sortDirection: "desc" } as const;
    case "name":
      return { sortKey: "title", sortDirection: "asc" } as const;
    case "-name":
      return { sortKey: "title", sortDirection: "desc" } as const;
    default:
      return { sortKey: "updatedAt", sortDirection: "desc" } as const;
  }
}

function normalizeSearchToken(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildLegacyFilters(categories: StorefrontCategory[], brands: StorefrontBrand[]) {
  const normalizedCategories = categories.map(normalizeCategory);

  return {
    brands: brands.map(normalizeBrand),
    categories: withCategoryChildren(normalizedCategories),
  };
}

export async function fetchLegacyFilters() {
  const context = await fetchCatalogContext();
  return buildLegacyFilters(context.categories, context.brands);
}

export async function fetchLegacyProductByToken(id: string) {
  const context = await fetchCatalogContext();
  const bySlug = await fetchStorefrontProductsPage({ slug: id, limit: 1 });

  if (bySlug[0]) {
    return normalizeProduct(bySlug[0], context);
  }

  const numericId = Number(id);
  if (Number.isFinite(numericId) && numericId > 0) {
    const matched = (await fetchStorefrontProductsPage({ id: numericId, limit: 1 }))[0] ?? null;
    if (matched) {
      return normalizeProduct(matched, context);
    }
  }

  return null;
}

export async function fetchLegacyProductsByTokens(ids: Array<string | number>) {
  const uniqueTokens = ids
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  if (uniqueTokens.length === 0) {
    return [];
  }

  const context = await fetchCatalogContext();
  const products = await Promise.all(uniqueTokens.map(async (token) => {
    const bySlug = await fetchStorefrontProductsPage({ slug: token, limit: 1 });

    if (bySlug[0]) {
      return normalizeProduct(bySlug[0], context);
    }

    const numericId = Number(token);
    if (Number.isFinite(numericId) && numericId > 0) {
      const matched = (await fetchStorefrontProductsPage({ id: numericId, limit: 1 }))[0] ?? null;
      if (matched) {
        return normalizeProduct(matched, context);
      }
    }

    return null;
  }));

  const lookup = new Map(products.filter((product): product is LegacyProduct => Boolean(product)).map((product) => [product._id, product]));

  return uniqueTokens
    .map((token) => lookup.get(token) ?? null)
    .filter((product): product is LegacyProduct => Boolean(product));
}

export async function fetchLegacyProductsPage(
  params: LegacyProductsPageParams = {},
): Promise<LegacyProductsPageResult> {
  const context = await fetchCatalogContext();
  const filters = buildLegacyFilters(context.categories, context.brands);
  const safePage = Number.isFinite(params.page) && Number(params.page) > 0 ? Number(params.page) : 1;
  const safeLimit =
    Number.isFinite(params.limit) && Number(params.limit) > 0
      ? Math.min(Number(params.limit), DEFAULT_PAGE_SIZE)
      : 20;
  const categoryIds = resolveCategoryIds(
    filters.categories,
    normalizeSearchToken(params.category),
    normalizeSearchToken(params.childCategory),
  );
  const selectedBrand = findBrandByToken(filters.brands, normalizeSearchToken(params.brand));
  const sortParams = mapSortParams(params.sortby);
  const shouldUseFeaturedNewestSort = params.sortby == null || params.sortby === "";

  if (params.instock || categoryIds.length > 1 || shouldUseFeaturedNewestSort) {
    const allProducts = (await listAllStorefrontProducts({
      search: normalizeSearchToken(params.search) ?? undefined,
    })).map((product) => normalizeProduct(product, context));

    const filteredProducts = allProducts.filter((product) => {
      if (params.instock && product.stock <= 0) {
        return false;
      }

      if (selectedBrand && product.brand !== selectedBrand._id) {
        return false;
      }

      if (categoryIds.length > 0 && !categoryIds.includes(product.category ?? "")) {
        return false;
      }

      return matchesSearch(product, params.search);
    });

    const sortedProducts =
      shouldUseFeaturedNewestSort
        ? sortLegacyProductsForNewest(filteredProducts, context.assets)
        : sortLegacyProducts(filteredProducts, params.sortby);
    const totalCount = sortedProducts.length;
    const offset = (safePage - 1) * safeLimit;
    const products = sortedProducts.slice(offset, offset + safeLimit);
    const totalPages = Math.ceil(totalCount / safeLimit);

    return {
      products,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalCount,
        hasMore: safePage < totalPages,
        hasPrevious: safePage > 1,
        limit: safeLimit,
      },
      filters,
    };
  }

  const upstreamPage = await fetchStorefrontProductsPage({
    page: safePage,
    limit: safeLimit + 1,
    search: normalizeSearchToken(params.search) ?? undefined,
    categoryId: categoryIds[0] ?? undefined,
    brandId: selectedBrand?._id ?? undefined,
    sortKey: sortParams.sortKey,
    sortDirection: sortParams.sortDirection,
    slug: normalizeSearchToken(params.slug),
  });

  let products = upstreamPage.map((product) => normalizeProduct(product, context));
  let hasMore = products.length > safeLimit;

  if (params.instock) {
    products = products.filter((product) => product.stock > 0);
    hasMore = false;
  }

  const pageItems = products.slice(0, safeLimit);

  return {
    products: pageItems,
    pagination: {
      currentPage: safePage,
      totalPages: hasMore ? safePage + 1 : safePage,
      totalCount: null,
      hasMore,
      hasPrevious: safePage > 1,
      limit: safeLimit,
    },
    filters,
  };
}

export function buildFeaturedGroupProducts(
  group: StorefrontFeaturedGroup,
  products: LegacyProduct[],
  limit?: number,
) {
  const directIds = group.productIds.map(String);
  const dynamicIds = products
    .filter((product) => {
      if (group.brandIds.length > 0 && product.brand && group.brandIds.includes(Number(product.brand))) {
        return true;
      }

      if (
        group.categoryIds.length > 0 &&
        product.category &&
        group.categoryIds.includes(Number(product.category))
      ) {
        return true;
      }

      return false;
    })
    .map((product) => product._id);

  const matchedProducts = filterProductsByIds(products, [...directIds, ...dynamicIds]);

  return typeof limit === "number" ? matchedProducts.slice(0, limit) : matchedProducts;
}

export function normalizeFeaturedGroup(
  group: StorefrontFeaturedGroup,
  products: LegacyProduct[],
  limit?: number,
): LegacyFeaturedGroup {
  return {
    _id: String(group.id),
    id: group.id,
    title: group.name,
    titleAr: group.nameAr,
    cta: group.cta,
    ctaAr: group.ctaAr,
    link: normalizeFeaturedGroupLink(group.link),
    products: buildFeaturedGroupProducts(group, products, limit),
  };
}

export function filterProductsByIds(
  products: LegacyProduct[],
  ids: Array<string | number>,
) {
  const wanted = ids.map(String);
  const productMap = new Map(products.map((product) => [product._id, product]));
  const uniqueOrderedIds = wanted.filter(
    (value, index) => wanted.indexOf(value) === index,
  );

  return uniqueOrderedIds
    .map((id) => productMap.get(id))
    .filter((product): product is LegacyProduct => Boolean(product));
}

export function resolveCategoryIds(
  categories: LegacyCategory[],
  category?: string | null,
  childCategory?: string | null,
) {
  const resolveCategoryToken = (token?: string | null) => {
    if (!token || token === "tous") {
      return null;
    }

    return (
      categories.find((item) => item.slug === token || item._id === token) ?? null
    );
  };

  const resolvedChild = resolveCategoryToken(childCategory);
  if (childCategory) {
    return resolvedChild ? [resolvedChild._id] : [];
  }

  const resolvedParent = resolveCategoryToken(category);
  if (!resolvedParent) {
    return [];
  }

  const childIds = categories
    .filter((item) => item.parent === resolvedParent._id)
    .map((item) => item._id);

  return [resolvedParent._id, ...childIds];
}

export function matchesSearch(product: LegacyProduct, query?: string | null) {
  if (!query) {
    return true;
  }

  const text = query.trim().toLowerCase();
  if (!text) {
    return true;
  }

  const haystacks = [
    product.title,
    product.title_ar,
    product.description,
    product.description_ar,
    product.summary,
    product.summary_ar,
    ...(product.features ?? []),
    ...(product.features_ar ?? []),
    product.sku ?? "",
    product.barcode ?? "",
    product.brandInfo?.name ?? "",
    product.categoryInfo?.name ?? "",
    product.categoryInfo?.name_ar ?? "",
  ];

  return haystacks.some((value) => value.toLowerCase().includes(text));
}

export function sortLegacyProducts(products: LegacyProduct[], sortby?: string | null) {
  const sorted = [...products];

  switch (sortby) {
    case "price":
      sorted.sort((left, right) => left.price - right.price);
      break;
    case "-price":
      sorted.sort((left, right) => right.price - left.price);
      break;
    case "name":
      sorted.sort((left, right) => left.title.localeCompare(right.title));
      break;
    case "-name":
      sorted.sort((left, right) => right.title.localeCompare(left.title));
      break;
    default:
      sorted.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
      break;
  }

  return sorted;
}

export function sortLegacyProductsForNewest(
  products: LegacyProduct[],
  assets?: Pick<StorefrontAssets, "featuredGroups"> | null,
) {
  const newestFirst = [...products].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  if (!assets?.featuredGroups?.length) {
    return newestFirst;
  }

  const prioritizedGroups = sortStorefrontFeaturedGroups(assets.featuredGroups).filter(
    (group) => group.showAtTopOfProductsPage && group.active,
  );

  if (prioritizedGroups.length === 0) {
    return newestFirst;
  }

  const prioritizedProducts = prioritizedGroups.flatMap((group) =>
    buildFeaturedGroupProducts(group, newestFirst),
  );

  const seen = new Set<string>();
  const orderedTopProducts = prioritizedProducts.filter((product) => {
    if (seen.has(product._id)) {
      return false;
    }

    seen.add(product._id);
    return true;
  });

  const remainingProducts = newestFirst.filter((product) => !seen.has(product._id));

  return [...orderedTopProducts, ...remainingProducts];
}

export function findDeliveryFee(
  catalog: StorefrontEcotrackCatalog,
  wilayaCode: number | null,
  delivery: "home" | "office",
) {
  if (wilayaCode == null) {
    return 0;
  }

  const serviceFee = catalog.serviceFees.find(
    (item) => item.wilayaId === wilayaCode && item.serviceType === "livraison",
  );

  if (!serviceFee) {
    return 0;
  }

  return Number(delivery === "office" ? serviceFee.stopDeskFee : serviceFee.homeFee);
}

export function findBrandByToken(brands: LegacyBrand[], token?: string | null) {
  if (!token || token === "tous") {
    return null;
  }

  return brands.find((brand) => brand.slug === token || brand._id === token) ?? null;
}

export function findCategoryByToken(
  categories: LegacyCategory[],
  token?: string | null,
) {
  if (!token || token === "tous") {
    return null;
  }

  return (
    categories.find((category) => category.slug === token || category._id === token) ??
    null
  );
}

export function buildProductHref(product: Pick<LegacyProduct, "slug" | "_id">) {
  return `/products/${product.slug}`;
}

export function buildLandingProductHref(
  product: Pick<LegacyProduct, "slug" | "_id">,
) {
  return `/landing/${product.slug}`;
}

export function buildBrandHref(brand?: Pick<LegacyBrand, "slug"> | null) {
  return brand?.slug ? `/brands/${brand.slug}` : "/products";
}

export function buildCategoryHref(category?: Pick<LegacyCategory, "slug"> | null) {
  return category?.slug ? `/categories/${category.slug}` : "/products";
}

export function buildBrandFilterHref(brand?: Pick<LegacyBrand, "slug"> | null) {
  return buildBrandHref(brand);
}

export function buildCategoryFilterHref(options: {
  category?: Pick<LegacyCategory, "slug"> | null;
  childCategory?: Pick<LegacyCategory, "slug"> | null;
}) {
  return buildCategoryHref(options.childCategory ?? options.category);
}

export function findWilayaByName(
  wilayas: StorefrontWilaya[],
  name?: string | null,
) {
  if (!name) {
    return null;
  }

  const normalized = name.trim().toLowerCase();
  return wilayas.find((wilaya) => wilaya.name.trim().toLowerCase() === normalized) ?? null;
}

export function getCommunesForWilaya(
  catalog: StorefrontEcotrackCatalog | null,
  wilayaId?: number | null,
) {
  if (!catalog || wilayaId == null) {
    return [];
  }

  return catalog.communes.filter((commune) => commune.wilayaId === wilayaId);
}
