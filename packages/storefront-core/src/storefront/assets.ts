import { asc, desc, eq } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import {
  assetBanners,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productCards,
} from '../../../db/src/schema';
import {
  toStorefrontBannerDto,
  toStorefrontFeaturedGroupDto,
  toStorefrontProductCardDto,
} from './dto';

type Database = ReturnType<typeof getDb>;

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

export async function readStorefrontAssets(db: Database) {
  const [banners, groups, groupProducts, groupBrands, groupCategories, cards] = await Promise.all([
    db
      .select()
      .from(assetBanners)
      .where(eq(assetBanners.active, true))
      .orderBy(asc(assetBanners.sortOrder), desc(assetBanners.updatedAt)),
    db
      .select()
      .from(featuredProductGroups)
      .where(eq(featuredProductGroups.active, true))
      .orderBy(asc(featuredProductGroups.sortOrder), desc(featuredProductGroups.updatedAt)),
    db.select().from(featuredProductGroupProducts),
    db.select().from(featuredProductGroupBrands),
    db.select().from(featuredProductGroupCategories),
    db
      .select()
      .from(productCards)
      .where(eq(productCards.active, true))
      .orderBy(asc(productCards.sortOrder), desc(productCards.updatedAt)),
  ]);

  return {
    banners: banners.map(toStorefrontBannerDto),
    featuredGroups: withSelections(groups, groupProducts, groupBrands, groupCategories).map(toStorefrontFeaturedGroupDto),
    productCards: cards.map(toStorefrontProductCardDto),
  };
}
