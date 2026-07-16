import { and, asc, count, desc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import {
  brands,
  categories,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  products,
} from '../../../db/src/schema';
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

  const document = buildCatalogSearchDocument();
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

function buildCatalogSearchDocument() {
  return sql<string>`translate(replace(replace(lower(regexp_replace(
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
}

export function buildCatalogSearchRelevance(value: string) {
  const normalized = normalizeCatalogSearch(value);
  if (!normalized) return undefined;

  const document = buildCatalogSearchDocument();
  const exactMatch = sql<number>`case when position(${normalized} in ${document}) > 0 then 1 else 0 end`;
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return threshold === null
    ? exactMatch
    : sql<number>`(${exactMatch} + word_similarity(${normalized}, ${document}))`;
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
  const standardSortKey = query.sortKey === 'recommended' ? 'updatedAt' : query.sortKey;
  const standardOrderBy = {
    title: direction(products.title),
    price: direction(products.price),
    updatedAt: direction(products.updatedAt),
    createdAt: direction(products.createdAt),
    active: direction(products.active),
    inStock: direction(products.inStock),
    purchasePrice: direction(products.purchasePrice),
  }[standardSortKey];
  const orderBy = query.sortKey === 'recommended'
    ? buildRecommendedProductOrderBy(query.search)
    : [standardOrderBy, direction(products.id)];
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
    .orderBy(...orderBy)
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return rows.map((row) => toStorefrontProductDto(row satisfies StorefrontProductDtoRow));
}

export async function readStorefrontProductsByIds(db: Database, ids: number[]) {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({
      id: products.id, slug: products.slug, mongoId: products.mongoId, title: products.title,
      titleAr: products.titleAr, description: products.description, descriptionAr: products.descriptionAr,
      sku: products.sku, barcode: products.barcode, price: products.price, oldPrice: products.oldPrice,
      active: products.active, inStock: products.inStock, availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity, brandId: products.brandId, categoryId: products.categoryId,
      images: products.images, createdAt: products.createdAt, updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.active, true), inArray(products.id, uniqueIds)));
  const byId = new Map(rows.map((row) => [row.id, toStorefrontProductDto(row satisfies StorefrontProductDtoRow)]));
  return uniqueIds.flatMap((id) => byId.get(id) ?? []);
}

export async function readStorefrontProductsForSelections(
  db: Database,
  selection: { productIds: number[]; brandIds: number[]; categoryIds: number[] },
  limit = 12,
) {
  const page = await readStorefrontProductsForSelectionPage(db, selection, { page: 1, limit });
  return page.items;
}

export async function readStorefrontProductsForSelectionPage(
  db: Database,
  selection: { productIds: number[]; brandIds: number[]; categoryIds: number[] },
  { page, limit }: { page: number; limit: number },
) {
  const direct = await readStorefrontProductsByIds(db, selection.productIds);
  const uniqueDirect = [...new Map(direct.map((product) => [product.id, product])).values()];
  const dynamicConditions = [
    selection.brandIds.length > 0 ? inArray(products.brandId, selection.brandIds) : undefined,
    selection.categoryIds.length > 0 ? inArray(products.categoryId, selection.categoryIds) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const start = Math.max(0, page - 1) * limit;
  if (dynamicConditions.length === 0) {
    return { items: uniqueDirect.slice(start, start + limit), total: uniqueDirect.length };
  }

  const dynamicWhere = and(
    eq(products.active, true),
    or(...dynamicConditions),
    uniqueDirect.length > 0 ? notInArray(products.id, uniqueDirect.map((product) => product.id)) : undefined,
  );
  const dynamicOffset = Math.max(0, start - uniqueDirect.length);
  const dynamicLimit = Math.max(0, limit - Math.max(0, uniqueDirect.length - start));

  const [countRows, rows] = await Promise.all([
    db.select({ count: count() }).from(products).where(dynamicWhere),
    dynamicLimit > 0 ? db
    .select({
      id: products.id, slug: products.slug, mongoId: products.mongoId, title: products.title,
      titleAr: products.titleAr, description: products.description, descriptionAr: products.descriptionAr,
      sku: products.sku, barcode: products.barcode, price: products.price, oldPrice: products.oldPrice,
      active: products.active, inStock: products.inStock, availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity, brandId: products.brandId, categoryId: products.categoryId,
      images: products.images, createdAt: products.createdAt, updatedAt: products.updatedAt,
    })
    .from(products)
    .where(dynamicWhere)
    .orderBy(...buildRecommendedProductOrderBy())
    .limit(dynamicLimit)
    .offset(dynamicOffset) : Promise.resolve([]),
  ]);

  return {
    items: [
      ...uniqueDirect.slice(start, start + limit),
      ...rows.map((row) => toStorefrontProductDto(row satisfies StorefrontProductDtoRow)),
    ].slice(0, limit),
    total: uniqueDirect.length + Number(countRows[0]?.count ?? 0),
  };
}

export function mergeStorefrontProductSelections<T extends { id: number }>(direct: T[], dynamic: T[], limit: number) {
  const seen = new Set<number>();
  return [...direct, ...dynamic].filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  }).slice(0, Math.max(0, limit));
}

export function buildRecommendedProductOrderBy(search = '') {
  const featuredGroupRank = sql<number>`coalesce((
    select min(${featuredProductGroups.sortOrder})
    from ${featuredProductGroups}
    where ${featuredProductGroups.active} = true
      and ${featuredProductGroups.showAtTopOfProductsPage} = true
      and (
        exists (
          select 1
          from ${featuredProductGroupProducts}
          where ${featuredProductGroupProducts.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupProducts.productId} = ${products.id}
        )
        or (${products.brandId} is not null and exists (
          select 1
          from ${featuredProductGroupBrands}
          where ${featuredProductGroupBrands.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupBrands.brandId} = ${products.brandId}
        ))
        or (${products.categoryId} is not null and exists (
          select 1
          from ${featuredProductGroupCategories}
          where ${featuredProductGroupCategories.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupCategories.categoryId} = ${products.categoryId}
        ))
      )
  ), 2147483647)`;

  const searchRelevance = buildCatalogSearchRelevance(search);

  return [
    ...(searchRelevance ? [desc(searchRelevance)] : []),
    asc(featuredGroupRank),
    desc(products.inStock),
    desc(products.popularityScore),
    desc(products.purchaseCount),
    desc(products.checkoutCount),
    desc(products.addToCartCount),
    desc(products.viewCount),
    desc(products.conversionRate),
    sql`${products.lastViewedAt} desc nulls last`,
    desc(products.updatedAt),
    desc(products.id),
  ];
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
