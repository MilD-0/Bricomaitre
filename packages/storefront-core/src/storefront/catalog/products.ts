import { brands, categories, productSlugHistory, products } from '@bric/db/schema';
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { StorefrontProductBuildFeedItem, StorefrontProductListQuery } from '../contracts';
import {
  toStorefrontProductDetailDto,
  toStorefrontProductDto,
  type StorefrontProductDetailDtoRow,
  type StorefrontProductDtoRow,
} from '../dto';
import { buildRecommendedProductOrderBy, buildStorefrontProductWhereClause } from './filtering';
import { normalizeStorefrontProductToken, selectStorefrontProductTokenMatch } from './search';
import { productSelection, type Database } from './selection';

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
      mongoId: products.mongoId,
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
        mongoId: row.mongoId,
        updatedAt: row.updatedAt.toISOString(),
      }) satisfies StorefrontProductBuildFeedItem,
  );
}
