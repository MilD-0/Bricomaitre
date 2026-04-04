import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';

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
