import { asc, desc, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  assetBanners,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productCards,
} from '@bric/db/schema';
import {
  toStorefrontBannerDto,
  toStorefrontFeaturedGroupDto,
  toStorefrontProductCardDto,
} from './dto';
import {
  readStorefrontBrands,
  readStorefrontCategories,
  readStorefrontProducts,
  readStorefrontProductsByIds,
  readStorefrontProductsForSelectionPage,
} from './catalog';

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
    featuredGroups: withSelections(groups, groupProducts, groupBrands, groupCategories).map(
      toStorefrontFeaturedGroupDto,
    ),
    productCards: cards.map(toStorefrontProductCardDto),
  };
}

export async function readStorefrontHomepage(db: Database) {
  const [assets, topProducts, categories, brands] = await Promise.all([
    readStorefrontAssets(db),
    readStorefrontProducts(db, {
      page: 1,
      limit: 8,
      search: '',
      brandId: null,
      categoryId: null,
      discounted: false,
      stock: 'all',
      minPrice: null,
      maxPrice: null,
      id: null,
      mongoId: null,
      slug: null,
      sortKey: 'recommended',
      sortDirection: 'desc',
    }),
    readStorefrontCategories(db),
    readStorefrontBrands(db),
  ]);
  const cardProducts = await readStorefrontProductsByIds(
    db,
    assets.productCards.map((card) => card.productId),
  );
  const cardProductById = new Map(cardProducts.map((product) => [product.id, product]));
  const featuredGroups = await Promise.all(
    assets.featuredGroups.map(async (group) => ({
      ...group,
      products: (await readStorefrontProductsForSelectionPage(db, group, { page: 1, limit: 12 }))
        .items,
    })),
  );

  return {
    banners: assets.banners,
    topProducts,
    categories,
    productCards: assets.productCards.flatMap((card) => {
      const product = cardProductById.get(card.productId);
      return product ? [{ ...card, product }] : [];
    }),
    brands,
    featuredGroups: featuredGroups.filter((group) => group.products.length > 0),
  };
}

export async function readStorefrontHomepageFeaturedGroupProducts(
  db: Database,
  groupId: number,
  page: number,
  limit: number,
) {
  const assets = await readStorefrontAssets(db);
  const group = assets.featuredGroups.find((item) => item.id === groupId);
  if (!group) return null;

  return readStorefrontProductsForSelectionPage(db, group, { page, limit });
}
