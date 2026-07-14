import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import { brands, categories, products } from '../../../db/src/schema';
import type { StorefrontProductListQuery } from './contracts';
import {
  toStorefrontBrandDto,
  toStorefrontCategoryDto,
  toStorefrontProductDetailDto,
  toStorefrontProductDto,
  type StorefrontProductDetailDtoRow,
  type StorefrontProductDtoRow,
} from './dto';

type Database = ReturnType<typeof getDb>;

export type StorefrontProductBuildFeedItem = {
  id: number;
  slug: string | null;
  updatedAt: string;
};

export type StorefrontProductTokenMatch = 'slug' | 'mongoId' | 'id';

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu;
const SEARCH_DOCUMENT_TRANSLATE_FROM = 'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const SEARCH_DOCUMENT_TRANSLATE_TO = 'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789';

export function normalizeCatalogSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(ARABIC_DIACRITICS, '')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئىيى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/گ/g, 'ك')
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getCatalogSearchSimilarityThreshold(value: string) {
  const length = normalizeCatalogSearch(value).replaceAll(' ', '').length;
  if (length < 4) return null;
  if (length <= 5) return 0.72;
  if (length <= 8) return 0.64;
  return 0.58;
}

export function buildCatalogSearchCondition(value: string) {
  const normalized = normalizeCatalogSearch(value);
  if (!normalized) return undefined;

  const document = sql<string>`translate(replace(replace(lower(regexp_replace(
    coalesce(${products.title}, '') || ' ' ||
    coalesce(${products.titleAr}, '') || ' ' ||
    coalesce(${products.description}, '') || ' ' ||
    coalesce(${products.descriptionAr}, '') || ' ' ||
    coalesce(${products.sku}, '') || ' ' ||
    coalesce(${products.barcode}, '') || ' ' ||
    coalesce(${products.slug}, '') || ' ' ||
    coalesce(${products.mongoId}, '') || ' ' ||
    coalesce(${brands.name}, '') || ' ' ||
    coalesce(${categories.name}, '') || ' ' ||
    coalesce(${categories.nameAr}, ''),
    '[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'), ${SEARCH_DOCUMENT_TRANSLATE_FROM}, ${SEARCH_DOCUMENT_TRANSLATE_TO})`;
  const exactTokens = normalized.split(' ').map((token) => sql<boolean>`position(${token} in ${document}) > 0`);
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return or(
    ilike(products.title, `%${value}%`),
    ilike(products.titleAr, `%${value}%`),
    ilike(products.sku, `%${value}%`),
    ilike(products.barcode, `%${value}%`),
    and(...exactTokens),
    threshold === null ? undefined : sql<boolean>`word_similarity(${normalized}, ${document}) >= ${threshold}`,
  );
}

export function normalizeStorefrontProductToken(value: string) {
  const token = value.trim();
  const numericId = /^[1-9]\d*$/.test(token) && Number.isSafeInteger(Number(token))
    ? Number(token)
    : null;

  return { token, numericId };
}

export function selectStorefrontProductTokenMatch<
  T extends { id: number; slug: string; mongoId: string | null },
>(rows: T[], token: string): { row: T; matchedBy: StorefrontProductTokenMatch } | null {
  const slugMatch = rows.find((row) => row.slug === token);
  if (slugMatch) {
    return { row: slugMatch, matchedBy: 'slug' };
  }

  const mongoIdMatch = rows.find((row) => row.mongoId === token);
  if (mongoIdMatch) {
    return { row: mongoIdMatch, matchedBy: 'mongoId' };
  }

  const { numericId } = normalizeStorefrontProductToken(token);
  const idMatch = numericId === null ? undefined : rows.find((row) => row.id === numericId);
  return idMatch ? { row: idMatch, matchedBy: 'id' } : null;
}

export async function readStorefrontProductByToken(db: Database, value: string) {
  const { token, numericId } = normalizeStorefrontProductToken(value);
  if (!token) {
    return null;
  }

  const tokenConditions = [eq(products.slug, token), eq(products.mongoId, token)];
  if (numericId !== null) {
    tokenConditions.push(eq(products.id, numericId));
  }

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      mongoId: products.mongoId,
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
      brand: {
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        image: brands.image,
      },
      category: {
        id: categories.id,
        name: categories.name,
        nameAr: categories.nameAr,
        slug: categories.slug,
        image: categories.image,
        parentId: categories.parentId,
        properties: categories.properties,
      },
    })
    .from(products)
    .leftJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true)))
    .leftJoin(categories, and(eq(products.categoryId, categories.id), eq(categories.isActive, true)))
    .where(and(eq(products.active, true), or(...tokenConditions)))
    .orderBy(
      asc(sql<number>`case
        when ${products.slug} = ${token} then 0
        when ${products.mongoId} = ${token} then 1
        else 2
      end`),
      asc(products.id),
    )
    .limit(1);

  const match = selectStorefrontProductTokenMatch(rows, token);
  if (!match) {
    return null;
  }

  return {
    item: toStorefrontProductDetailDto(match.row satisfies StorefrontProductDetailDtoRow),
    resolution: {
      requestedToken: token,
      matchedBy: match.matchedBy,
      canonicalToken: match.row.slug,
    },
  };
}

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
  const whereClause = buildStorefrontProductWhereClause(query);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      mongoId: products.mongoId,
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
    .leftJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true)))
    .leftJoin(categories, and(eq(products.categoryId, categories.id), eq(categories.isActive, true)))
    .where(whereClause)
    .orderBy(orderBy, direction(products.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return rows.map((row) => toStorefrontProductDto(row satisfies StorefrontProductDtoRow));
}

function buildStorefrontProductWhereClause(query: StorefrontProductListQuery) {
  return and(
    eq(products.active, true),
    query.id === null ? undefined : eq(products.id, query.id),
    query.mongoId ? eq(products.mongoId, query.mongoId) : undefined,
    query.slug ? eq(products.slug, query.slug) : undefined,
    query.search ? buildCatalogSearchCondition(query.search) : undefined,
    query.brandId === null ? undefined : eq(products.brandId, query.brandId),
    query.categoryId === null ? undefined : eq(products.categoryId, query.categoryId),
  );
}

export async function countStorefrontProducts(
  db: Database,
  query: StorefrontProductListQuery,
) {
  const rows = await db
    .select({ count: count() })
    .from(products)
    .leftJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true)))
    .leftJoin(categories, and(eq(products.categoryId, categories.id), eq(categories.isActive, true)))
    .where(buildStorefrontProductWhereClause(query));

  return Number(rows[0]?.count ?? 0);
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
