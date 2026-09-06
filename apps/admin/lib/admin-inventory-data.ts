import { asc, count, desc, eq, gt, ilike, inArray, or } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { inventoryQuerySchema, type InventoryListResponse } from './inventory';

type InventoryQuery = import('zod').input<typeof inventoryQuerySchema>;

export async function loadInventoryPageData(
  input: InventoryQuery,
  writable: boolean,
  productIds: readonly number[] = [],
): Promise<InventoryListResponse> {
  const query = inventoryQuerySchema.parse(input);
  const uniqueProductIds = [...new Set(productIds)].slice(0, 100);

  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: query.page > 1,
      },
    };
  }

  const search = query.search.trim();
  const searchFilter =
    uniqueProductIds.length > 0
      ? inArray(products.id, uniqueProductIds)
      : search
        ? or(
            eq(products.barcode, search),
            ilike(products.title, `%${search}%`),
            ilike(products.sku, `%${search}%`),
          )
        : gt(products.inventoryQuantity, 0);
  const db = getDb();
  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(products)
    .where(searchFilter);
  const totalPages = Math.max(1, Math.ceil(Number(totalItems) / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      inStock: products.inStock,
      availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(searchFilter)
    .orderBy(
      ...query.sort.map(({ key, direction }) =>
        direction === 'asc' ? asc(products[key]) : desc(products[key]),
      ),
      asc(products.id),
    )
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  return {
    writable,
    items: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    pagination: {
      page,
      limit: query.limit,
      totalItems: Number(totalItems),
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
