import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import { brands, categories, products } from '../../../db/src/schema';
import type { StorefrontProductListQuery } from './contracts';
import {
  toStorefrontBrandDto,
  toStorefrontCategoryDto,
  toStorefrontProductDto,
  type StorefrontProductDtoRow,
} from './dto';

type Database = ReturnType<typeof getDb>;

export type StorefrontProductBuildFeedItem = {
  id: number;
  slug: string | null;
  updatedAt: string;
};

export async function readStorefrontProducts(
  db: Database,
  query: StorefrontProductListQuery,
) {
  const direction = query.sortDirection === 'asc' ? asc : desc;
  const orderBy = {
    title: direction(products.title),
    price: direction(products.price),
    updatedAt: direction(products.updatedAt),
    createdAt: direction(products.createdAt),
    active: direction(products.active),
    inStock: direction(products.inStock),
    purchasePrice: direction(products.purchasePrice),
  }[query.sortKey];
  const whereClause = and(
    eq(products.active, true),
    query.id === null ? undefined : eq(products.id, query.id),
    query.slug ? eq(products.slug, query.slug) : undefined,
    query.search
      ? or(
        ilike(products.title, `%${query.search}%`),
        ilike(products.sku, `%${query.search}%`),
        ilike(products.barcode, `%${query.search}%`),
      )
      : undefined,
    query.brandId === null ? undefined : eq(products.brandId, query.brandId),
    query.categoryId === null ? undefined : eq(products.categoryId, query.categoryId),
  );

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      titleAr: products.titleAr,
      description: products.description,
      descriptionAr: products.descriptionAr,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
      oldPrice: products.oldPrice,
      active: products.active,
      inStock: products.inStock,
      availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity,
      brandId: products.brandId,
      categoryId: products.categoryId,
      images: products.images,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return rows.map((row) => toStorefrontProductDto(row satisfies StorefrontProductDtoRow));
}

export async function readStorefrontProductBuildFeed(db: Database) {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(desc(products.updatedAt), desc(products.id));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    updatedAt: row.updatedAt.toISOString(),
  }) satisfies StorefrontProductBuildFeedItem);
}

export async function readStorefrontBrands(db: Database) {
  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      image: brands.image,
      featured: brands.featured,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
    })
    .from(brands)
    .where(eq(brands.isActive, true))
    .orderBy(asc(brands.name));

  return rows.map(toStorefrontBrandDto);
}

export async function readStorefrontCategories(db: Database) {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      nameEn: categories.nameEn,
      nameAr: categories.nameAr,
      image: categories.image,
      parentId: categories.parentId,
      properties: categories.properties,
      featured: categories.featured,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.name));

  return rows.map(toStorefrontCategoryDto);
}

export async function readStorefrontCatalogCounts(db: Database) {
  const productWhereClause = eq(products.active, true);
  const brandWhereClause = eq(brands.isActive, true);
  const categoryWhereClause = eq(categories.isActive, true);

  const [productRows, brandRows, categoryRows] = await Promise.all([
    db.select({ count: count() }).from(products).where(productWhereClause),
    db.select({ count: count() }).from(brands).where(brandWhereClause),
    db.select({ count: count() }).from(categories).where(categoryWhereClause),
  ]);

  return {
    productCount: Number(productRows[0]?.count ?? 0),
    brandCount: Number(brandRows[0]?.count ?? 0),
    categoryCount: Number(categoryRows[0]?.count ?? 0),
  };
}
