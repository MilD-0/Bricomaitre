import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  brands,
  categories,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productSlugHistory,
  products,
} from '@bric/db/schema';
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

const productSelection = {
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
  inStock: products.inStock,
  availabilityStatus: products.availabilityStatus,
  brandId: products.brandId,
  categoryId: products.categoryId,
  images: products.images,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

export type StorefrontProductBuildFeedItem = {
  id: number;
  slug: string | null;
  updatedAt: string;
};

export type StorefrontProductTokenMatch = 'slug' | 'mongoId' | 'id';

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu;
const SEARCH_DOCUMENT_TRANSLATE_FROM =
  'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const SEARCH_DOCUMENT_TRANSLATE_TO =
  'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789';

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
  const exactTokens = normalized
    .split(' ')
    .map((token) => sql<boolean>`position(${token} in ${document}) > 0`);
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return or(
    ilike(products.title, `%${value}%`),
    ilike(products.titleAr, `%${value}%`),
    ilike(products.sku, `%${value}%`),
    ilike(products.barcode, `%${value}%`),
    and(...exactTokens),
    threshold === null
      ? undefined
      : sql<boolean>`word_similarity(${normalized}, ${document}) >= ${threshold}`,
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

function buildCatalogSearchTitleDocument() {
  return sql<string>`translate(replace(replace(lower(regexp_replace(
    coalesce(${products.title}, '') || ' ' ||
    coalesce(${products.titleAr}, ''),
    '[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'), ${SEARCH_DOCUMENT_TRANSLATE_FROM}, ${SEARCH_DOCUMENT_TRANSLATE_TO})`;
}

export function buildCatalogSearchRelevance(value: string) {
  const normalized = normalizeCatalogSearch(value);
  if (!normalized) return undefined;

  const document = buildCatalogSearchDocument();
  const titleDocument = buildCatalogSearchTitleDocument();
  const exactMatch = sql<number>`case when position(${normalized} in ${document}) > 0 then 1 else 0 end`;
  const exactTitleMatch = sql<number>`case when position(${normalized} in ${titleDocument}) > 0 then 1 else 0 end`;
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return threshold === null
    ? sql<number>`(${exactMatch} + ${exactTitleMatch})`
    : sql<number>`(
        ${exactMatch} + word_similarity(${normalized}, ${document}) +
        ${exactTitleMatch} + word_similarity(${normalized}, ${titleDocument})
      )`;
}

export function normalizeStorefrontProductToken(value: string) {
  const token = value.trim();
  const numericId =
    /^[1-9]\d*$/.test(token) && Number.isSafeInteger(Number(token)) ? Number(token) : null;

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
  return readStorefrontProductDetail(db, value);
}

export async function readStorefrontProductById(db: Database, id: number) {
  return readStorefrontProductDetail(db, String(id), true);
}

async function readStorefrontProductDetail(db: Database, value: string, exactId = false) {
  const { token, numericId } = normalizeStorefrontProductToken(value);
  if (!token) {
    return null;
  }

  const legacySlugCondition = sql<boolean>`exists (
    select 1 from ${productSlugHistory}
    where ${productSlugHistory.productId} = ${products.id}
      and ${productSlugHistory.slug} = ${token}
  )`;
  const tokenConditions = [
    eq(products.slug, token),
    eq(products.mongoId, token),
    legacySlugCondition,
  ];
  if (numericId !== null) {
    tokenConditions.push(eq(products.id, numericId));
  }

  const rows = await db
    .select({
      ...productSelection,
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
    .leftJoin(
      categories,
      and(eq(products.categoryId, categories.id), eq(categories.isActive, true)),
    )
    .where(
      and(
        eq(products.active, true),
        isNull(products.archivedAt),
        exactId ? eq(products.id, numericId!) : or(...tokenConditions),
      ),
    )
    .orderBy(
      asc(sql<number>`case
        when ${products.slug} = ${token} then 0
        when ${products.mongoId} = ${token} then 1
        when ${legacySlugCondition} then 2
        else 3
      end`),
      asc(products.id),
    )
    .limit(1);

  const match =
    selectStorefrontProductTokenMatch(rows, token) ??
    (rows[0] ? { row: rows[0], matchedBy: 'slug' as const } : null);
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

export async function readStorefrontProducts(db: Database, query: StorefrontProductListQuery) {
  const direction = query.sortDirection === 'asc' ? asc : desc;
  const standardSortKey = query.sortKey === 'recommended' ? 'updatedAt' : query.sortKey;
  const standardOrderBy = {
    title: direction(products.title),
    price: direction(products.price),
    updatedAt: direction(products.updatedAt),
    createdAt: direction(products.createdAt),
    inStock: direction(products.inStock),
  }[standardSortKey];
  const orderBy =
    query.sortKey === 'recommended'
      ? buildRecommendedProductOrderBy(query.search)
      : [standardOrderBy, direction(products.id)];
  const whereClause = buildStorefrontProductWhereClause(query);

  const statement = db.select(productSelection).from(products).$dynamic();
  if (query.search) {
    statement
      .leftJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true)))
      .leftJoin(
        categories,
        and(eq(products.categoryId, categories.id), eq(categories.isActive, true)),
      );
  }
  const rows = await statement
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
    .select(productSelection)
    .from(products)
    .where(
      and(eq(products.active, true), isNull(products.archivedAt), inArray(products.id, uniqueIds)),
    );
  const byId = new Map(
    rows.map((row) => [row.id, toStorefrontProductDto(row satisfies StorefrontProductDtoRow)]),
  );
  return uniqueIds.flatMap((id) => byId.get(id) ?? []);
}

export async function readStorefrontProductsForSelectionPage(
  db: Database,
  selection: { productIds: number[]; brandIds: number[]; categoryIds: number[] },
  { page, limit, includeTotal = true }: { page: number; limit: number; includeTotal?: boolean },
) {
  const direct = await readStorefrontProductsByIds(db, selection.productIds);
  const dynamicConditions = [
    selection.brandIds.length > 0 ? inArray(products.brandId, selection.brandIds) : undefined,
    selection.categoryIds.length > 0
      ? inArray(products.categoryId, selection.categoryIds)
      : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const start = Math.max(0, page - 1) * limit;
  if (dynamicConditions.length === 0) {
    return { items: direct.slice(start, start + limit), total: direct.length };
  }

  const dynamicWhere = and(
    eq(products.active, true),
    isNull(products.archivedAt),
    or(...dynamicConditions),
    direct.length > 0
      ? notInArray(
          products.id,
          direct.map((product) => product.id),
        )
      : undefined,
  );
  const dynamicOffset = Math.max(0, start - direct.length);
  const dynamicLimit = Math.max(0, limit - Math.max(0, direct.length - start));

  const [countRows, rows] = await Promise.all([
    includeTotal
      ? db.select({ count: count() }).from(products).where(dynamicWhere)
      : Promise.resolve(null),
    dynamicLimit > 0
      ? db
          .select(productSelection)
          .from(products)
          .where(dynamicWhere)
          .orderBy(...buildRecommendedProductOrderBy())
          .limit(dynamicLimit)
          .offset(dynamicOffset)
      : Promise.resolve([]),
  ]);

  return {
    items: [
      ...direct.slice(start, start + limit),
      ...rows.map((row) => toStorefrontProductDto(row satisfies StorefrontProductDtoRow)),
    ].slice(0, limit),
    total: countRows === null ? null : direct.length + Number(countRows[0]?.count ?? 0),
  };
}

export function buildRecommendedProductOrderBy(search = '') {
  const featuredGroupRank = sql<number>`coalesce((
    select min(${featuredProductGroups.sortOrder})
    from ${featuredProductGroups}
    where ${featuredProductGroups.active} = true
      and ${featuredProductGroups.prioritizeRecommendations} = true
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
    desc(products.unitsSold),
    desc(products.updatedAt),
    desc(products.id),
  ];
}

function buildStorefrontProductWhereClause(query: StorefrontProductListQuery) {
  return and(
    eq(products.active, true),
    isNull(products.archivedAt),
    query.id === null ? undefined : eq(products.id, query.id),
    query.mongoId ? eq(products.mongoId, query.mongoId) : undefined,
    query.slug ? eq(products.slug, query.slug) : undefined,
    query.search ? buildCatalogSearchCondition(query.search) : undefined,
    query.brandId === null ? undefined : eq(products.brandId, query.brandId),
    query.categoryId === null
      ? undefined
      : sql`${products.categoryId} in (
          with recursive category_tree as (
            select ${categories.id} from ${categories} where ${categories.id} = ${query.categoryId}
            union all
            select child.${sql.identifier('id')}
            from ${categories} child
            inner join category_tree parent on child.${sql.identifier('parent_id')} = parent.${sql.identifier('id')}
          )
          select ${sql.identifier('id')} from category_tree
        )`,
    query.minPrice === null ? undefined : gte(products.price, query.minPrice.toFixed(2)),
    query.maxPrice === null ? undefined : lte(products.price, query.maxPrice.toFixed(2)),
    query.stock === 'in'
      ? eq(products.inStock, true)
      : query.stock === 'out'
        ? eq(products.inStock, false)
        : undefined,
    query.discounted
      ? and(sql`${products.oldPrice} is not null`, gt(products.oldPrice, products.price))
      : undefined,
  );
}

export async function countStorefrontProducts(db: Database, query: StorefrontProductListQuery) {
  const statement = db.select({ count: count() }).from(products).$dynamic();
  if (query.search) {
    statement
      .leftJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true)))
      .leftJoin(
        categories,
        and(eq(products.categoryId, categories.id), eq(categories.isActive, true)),
      );
  }
  const rows = await statement.where(buildStorefrontProductWhereClause(query));

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
    .where(and(eq(products.active, true), isNull(products.archivedAt)))
    .orderBy(desc(products.updatedAt), desc(products.id));

  return rows.map(
    (row) =>
      ({
        id: row.id,
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
      }) satisfies StorefrontProductBuildFeedItem,
  );
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
  const [rows, directProductCounts] = await Promise.all([
    db
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
      .orderBy(asc(categories.name)),
    db
      .select({ categoryId: products.categoryId, count: count() })
      .from(products)
      .where(
        and(
          eq(products.active, true),
          isNull(products.archivedAt),
          sql`${products.categoryId} is not null`,
        ),
      )
      .groupBy(products.categoryId),
  ]);

  const directCounts = new Map(
    directProductCounts.map((row) => [row.categoryId, Number(row.count)]),
  );
  const children = new Map<number, number[]>();
  for (const row of rows) {
    if (row.parentId == null) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  }
  const countWithDescendants = (categoryId: number, seen = new Set<number>()): number => {
    if (seen.has(categoryId)) return 0;
    seen.add(categoryId);
    return (
      (directCounts.get(categoryId) ?? 0) +
      (children.get(categoryId) ?? []).reduce(
        (sum, childId) => sum + countWithDescendants(childId, new Set(seen)),
        0,
      )
    );
  };

  return rows.map((row) => ({
    ...toStorefrontCategoryDto(row),
    productCount: countWithDescendants(row.id),
  }));
}

export async function readStorefrontCatalogCounts(db: Database) {
  const productWhereClause = buildCatalogCountProductVisibilityCondition();
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

/**
 * The release preflight starts the candidate API before applying pending
 * migrations. Read the archive marker through the row JSON so this one probe
 * works both before migration 0071 creates products.archived_at and after the
 * modern catalog starts using it. Missing and null archive markers are both
 * visible; archived products remain excluded once the column exists.
 */
export function buildCatalogCountProductVisibilityCondition() {
  return and(
    eq(products.active, true),
    sql<boolean>`(to_jsonb(${products}) ->> 'archived_at') is null`,
  );
}
