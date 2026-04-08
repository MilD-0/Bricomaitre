import { asc, desc } from 'drizzle-orm';

import { getDb, hasDb } from '../db/client';
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
} from '../db/schema';
import type {
  AssetBannerRecord,
  AssetMetaBrand,
  AssetMetaCategory,
  AssetMetaProduct,
  AssetsResponse,
  FeaturedProductGroupRecord,
  ProductCardRecord,
} from './assets';

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

  selectedProducts.forEach((entry) => productMap.set(entry.groupId, [...(productMap.get(entry.groupId) ?? []), entry.productId]));
  selectedBrands.forEach((entry) => brandMap.set(entry.groupId, [...(brandMap.get(entry.groupId) ?? []), entry.brandId]));
  selectedCategories.forEach((entry) => categoryMap.set(entry.groupId, [...(categoryMap.get(entry.groupId) ?? []), entry.categoryId]));

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
    db.select().from(assetBanners).orderBy(asc(assetBanners.sortOrder), desc(assetBanners.updatedAt)),
    db.select().from(featuredProductGroups).orderBy(asc(featuredProductGroups.sortOrder), desc(featuredProductGroups.updatedAt)),
    db.select().from(featuredProductGroupProducts),
    db.select().from(featuredProductGroupBrands),
    db.select().from(featuredProductGroupCategories),
    db.select().from(productCards).orderBy(asc(productCards.sortOrder), desc(productCards.updatedAt)),
  ]);

  return {
    banners: banners.map((banner) => ({
      ...serializeAssetRecord(banner),
      titleAr: banner.titleAr ?? '',
    })) satisfies AssetBannerRecord[],
    featuredGroups: withSelections(groups, groupProducts, groupBrands, groupCategories).map((group) => ({
      ...serializeAssetRecord(group),
      nameAr: group.nameAr ?? '',
    })) satisfies FeaturedProductGroupRecord[],
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
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
  ]);

  return {
    products: productRows,
    brands: brandRows,
    categories: categoryRows,
  };
}
