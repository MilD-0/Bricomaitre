import { getDb } from '@bric/db/client';
import { brands, categories, productPromoCodes, products } from '@bric/db/schema';
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
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { type Database, adminAiCatalogQuerySchema } from './contract';

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDate(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

async function resolveCategoryScope(
  database: Database,
  categoryIds: number[],
  includeDescendants: boolean,
) {
  if (!includeDescendants || categoryIds.length === 0) return categoryIds;
  const rows = await database
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories);
  const selected = new Set(categoryIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId !== null && selected.has(row.parentId) && !selected.has(row.id)) {
        selected.add(row.id);
        changed = true;
      }
    }
  }
  return [...selected];
}

function promotionRowFilters(input: z.output<typeof adminAiCatalogQuerySchema>, now: Date) {
  return [
    {
      any: undefined,
      none: undefined,
      active: and(
        eq(productPromoCodes.active, true),
        or(isNull(productPromoCodes.startsAt), lte(productPromoCodes.startsAt, now)),
        or(isNull(productPromoCodes.endsAt), gte(productPromoCodes.endsAt, now)),
      ),
      not_started: and(eq(productPromoCodes.active, true), gt(productPromoCodes.startsAt, now)),
      ended: lt(productPromoCodes.endsAt, now),
      disabled: eq(productPromoCodes.active, false),
    }[input.promotion],
    input.promoEndsFrom
      ? gte(productPromoCodes.endsAt, startOfDate(input.promoEndsFrom))
      : undefined,
    input.promoEndsThrough
      ? lte(productPromoCodes.endsAt, endOfDate(input.promoEndsThrough))
      : undefined,
  ].filter((filter) => filter !== undefined);
}

function promotionFilter(input: z.output<typeof adminAiCatalogQuerySchema>, now: Date) {
  if (input.promotion === 'none') {
    return sql`not exists (
      select 1 from ${productPromoCodes}
      where ${productPromoCodes.productId} = ${products.id}
    )`;
  }
  const rowFilters = promotionRowFilters(input, now);
  if (rowFilters.length === 0) return undefined;
  return sql`exists (
    select 1 from ${productPromoCodes}
    where ${productPromoCodes.productId} = ${products.id}
      and ${and(...rowFilters)}
  )`;
}

export async function queryAdminCatalogProducts(
  raw: z.input<typeof adminAiCatalogQuerySchema>,
  database: Database = getDb(),
  now = new Date(),
) {
  const input = adminAiCatalogQuerySchema.parse(raw);
  const categoryIds = await resolveCategoryScope(
    database,
    input.categoryIds,
    input.includeCategoryDescendants,
  );
  const filters = [
    input.archive === 'current'
      ? isNull(products.archivedAt)
      : input.archive === 'archived'
        ? isNotNull(products.archivedAt)
        : undefined,
    input.query
      ? or(
          ilike(products.title, `%${input.query}%`),
          ilike(products.sku, `%${input.query}%`),
          ilike(products.barcode, `%${input.query}%`),
        )
      : undefined,
    input.productState === 'any' ? undefined : eq(products.active, input.productState === 'active'),
    input.stockState === 'any' ? undefined : eq(products.inStock, input.stockState === 'in_stock'),
    input.inventoryMin === null ? undefined : gte(products.inventoryQuantity, input.inventoryMin),
    input.inventoryMax === null ? undefined : lte(products.inventoryQuantity, input.inventoryMax),
    input.brandIds.length > 0 ? inArray(products.brandId, input.brandIds) : undefined,
    categoryIds.length > 0 ? inArray(products.categoryId, categoryIds) : undefined,
    promotionFilter(input, now),
  ].filter((filter) => filter !== undefined);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [{ value: totalItems = 0 } = { value: 0 }] = await database
    .select({ value: count() })
    .from(products)
    .where(where);
  const total = Number(totalItems);
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(input.page, totalPages);
  const promotionEndFilters = promotionRowFilters(input, now);
  const sortColumn = {
    title: products.title,
    price: products.price,
    purchasePrice: products.purchasePrice,
    inventoryQuantity: products.inventoryQuantity,
    promotionEnd: sql<Date | null>`(
      select min(${productPromoCodes.endsAt})
      from ${productPromoCodes}
      where ${productPromoCodes.productId} = ${products.id}
        ${promotionEndFilters.length > 0 ? sql`and ${and(...promotionEndFilters)}` : sql``}
    )`,
    updatedAt: products.updatedAt,
    archivedAt: products.archivedAt,
  }[input.sortBy];
  const direction = input.sortDirection === 'asc' ? asc : desc;
  const rows = await database
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
      oldPrice: products.oldPrice,
      purchasePrice: products.purchasePrice,
      active: products.active,
      inStock: products.inStock,
      availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity,
      brandId: products.brandId,
      brandName: brands.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      archivedAt: products.archivedAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(direction(sortColumn), desc(products.id))
    .limit(input.limit)
    .offset((page - 1) * input.limit);
  const productIds = rows.map((row) => row.id);
  const promoRows =
    productIds.length === 0
      ? []
      : await database
          .select({
            productId: productPromoCodes.productId,
            code: productPromoCodes.code,
            promoPrice: productPromoCodes.promoPrice,
            active: productPromoCodes.active,
            startsAt: productPromoCodes.startsAt,
            endsAt: productPromoCodes.endsAt,
          })
          .from(productPromoCodes)
          .where(inArray(productPromoCodes.productId, productIds))
          .orderBy(asc(productPromoCodes.endsAt), asc(productPromoCodes.code));
  const promosByProduct = new Map<number, typeof promoRows>();
  for (const promo of promoRows) {
    promosByProduct.set(promo.productId, [...(promosByProduct.get(promo.productId) ?? []), promo]);
  }

  return {
    kind: 'catalog_query' as const,
    asOf: now.toISOString(),
    filters: input,
    categoryScopeIds: categoryIds,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      sku: row.sku,
      barcode: row.barcode,
      lifecycle: {
        archivedAt: row.archivedAt?.toISOString() ?? null,
        active: row.active,
        inStock: row.inStock,
        status: row.availabilityStatus,
      },
      inventoryQuantity: row.inventoryQuantity,
      pricing: {
        priceDzd: Number(row.price),
        oldPriceDzd: row.oldPrice === null ? null : Number(row.oldPrice),
        purchasePriceDzd: row.purchasePrice === null ? null : Number(row.purchasePrice),
      },
      taxonomy: {
        brand: row.brandId ? { id: row.brandId, name: row.brandName } : null,
        category: row.categoryId ? { id: row.categoryId, name: row.categoryName } : null,
      },
      promotions: (promosByProduct.get(row.id) ?? []).map((promo) => ({
        code: promo.code,
        promoPriceDzd: Number(promo.promoPrice),
        active: promo.active,
        startsAt: promo.startsAt?.toISOString() ?? null,
        endsAt: promo.endsAt?.toISOString() ?? null,
      })),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      limit: input.limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
