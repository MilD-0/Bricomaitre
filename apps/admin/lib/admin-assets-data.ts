import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import {
  assetBanners,
  brands,
  categories,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productCards,
  products,
} from '@bric/db/schema';
import {
  buildCatalogSearchCondition,
  buildCatalogSearchRelevance,
} from '@bric/storefront-core/catalog';
import type {
  AssetBannerRecord,
  AssetMetaBrand,
  AssetMetaCategory,
  AssetMetaProduct,
  AssetProductOption,
  AssetsResponse,
  FeaturedProductGroupRecord,
  ProductCardRecord,
} from './assets';

function toProductOption(row: {
  id: number;
  title: string;
  slug: string;
  sku: string | null;
  images: string[];
  active: boolean;
}): AssetProductOption {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    sku: row.sku,
    imageUrl: row.images[0] ?? null,
    active: row.active,
  };
}

function serializeAssetRecord<T extends { createdAt: Date; updatedAt: Date }>(
  item: T,
): Omit<T, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string } {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function withSelections<T extends { id: number }>(
  items: T[],
  selectedProducts: Array<{ groupId: number; productId: number }>,
  selectedBrands: Array<{ groupId: number; brandId: number }>,
  selectedCategories: Array<{ groupId: number; categoryId: number }>,
) {
  const productMap = new Map<number, number[]>();
  const brandMap = new Map<number, number[]>();
  const categoryMap = new Map<number, number[]>();

  selectedProducts.forEach((entry) =>
    productMap.set(entry.groupId, [...(productMap.get(entry.groupId) ?? []), entry.productId]),
  );
  selectedBrands.forEach((entry) =>
    brandMap.set(entry.groupId, [...(brandMap.get(entry.groupId) ?? []), entry.brandId]),
  );
  selectedCategories.forEach((entry) =>
    categoryMap.set(entry.groupId, [...(categoryMap.get(entry.groupId) ?? []), entry.categoryId]),
  );

  return items.map((item) => ({
    ...item,
    productIds: productMap.get(item.id) ?? [],
    brandIds: brandMap.get(item.id) ?? [],
    categoryIds: categoryMap.get(item.id) ?? [],
  }));
}

export async function loadAssetsData(): Promise<AssetsResponse> {
  if (!hasDb()) {
    return { banners: [], featuredGroups: [], productCards: [] };
  }

  const db = getDb();
  const [banners, groups, groupProducts, groupBrands, groupCategories, cards] = await Promise.all([
    db
      .select()
      .from(assetBanners)
      .orderBy(asc(assetBanners.sortOrder), desc(assetBanners.updatedAt)),
    db
      .select()
      .from(featuredProductGroups)
      .orderBy(asc(featuredProductGroups.sortOrder), desc(featuredProductGroups.updatedAt)),
    db.select().from(featuredProductGroupProducts),
    db.select().from(featuredProductGroupBrands),
    db.select().from(featuredProductGroupCategories),
    db
      .select()
      .from(productCards)
      .orderBy(asc(productCards.sortOrder), desc(productCards.updatedAt)),
  ]);

  return {
    banners: banners.map((banner) => ({
      ...serializeAssetRecord(banner),
      titleAr: banner.titleAr ?? '',
    })) satisfies AssetBannerRecord[],
    featuredGroups: withSelections(groups, groupProducts, groupBrands, groupCategories).map(
      (group) => ({
        ...serializeAssetRecord(group),
        nameAr: group.nameAr ?? '',
      }),
    ) satisfies FeaturedProductGroupRecord[],
    productCards: cards.map((card) => serializeAssetRecord(card)) satisfies ProductCardRecord[],
  };
}

export async function loadAssetsMetaData(): Promise<{
  products: AssetMetaProduct[];
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
}> {
  if (!hasDb()) {
    return { products: [], brands: [], categories: [] };
  }

  const db = getDb();
  const [productRows, brandRows, categoryRows] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        brandId: products.brandId,
        categoryId: products.categoryId,
        images: products.images,
      })
      .from(products)
      .orderBy(asc(products.title)),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name)),
  ]);

  return {
    products: productRows,
    brands: brandRows,
    categories: categoryRows,
  };
}

export async function loadAssetsTaxonomyData(): Promise<{
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
}> {
  if (!hasDb()) return { brands: [], categories: [] };
  const db = getDb();
  const [brandRows, categoryRows] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name)),
  ]);
  return { brands: brandRows, categories: categoryRows };
}

export function buildAssetProductSearch(value: string) {
  return {
    condition: buildCatalogSearchCondition(value),
    relevance: buildCatalogSearchRelevance(value),
  };
}

export async function searchAssetProductOptions(input: {
  search: string;
  ids: number[];
  page: number;
  limit: number;
}) {
  if (!hasDb())
    return { items: [] as AssetProductOption[], page: input.page, limit: input.limit, total: 0 };
  const db = getDb();
  const selection = {
    id: products.id,
    title: products.title,
    slug: products.slug,
    sku: products.sku,
    images: products.images,
    active: products.active,
  };

  if (input.ids.length > 0) {
    const uniqueIds = [...new Set(input.ids)];
    const rows = await db
      .select(selection)
      .from(products)
      .where(and(isNull(products.archivedAt), inArray(products.id, uniqueIds)));
    const byId = new Map(rows.map((row) => [row.id, toProductOption(row)]));
    const items = uniqueIds.flatMap((id) => byId.get(id) ?? []);
    return { items, page: 1, limit: uniqueIds.length || input.limit, total: items.length };
  }

  const query = input.search.trim();
  const search = buildAssetProductSearch(query);
  const where = and(isNull(products.archivedAt), search.condition);
  const offset = (input.page - 1) * input.limit;
  const [countRows, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where),
    db
      .select(selection)
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(
        ...(search.relevance ? [desc(search.relevance)] : []),
        asc(products.title),
        asc(products.id),
      )
      .limit(input.limit)
      .offset(offset),
  ]);
  return {
    items: rows.map(toProductOption),
    page: input.page,
    limit: input.limit,
    total: Number(countRows[0]?.value ?? 0),
  };
}
