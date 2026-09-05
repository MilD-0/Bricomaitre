import { and, count, desc, ilike, inArray, isNotNull, or } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export type ArchivedProduct = {
  id: number;
  title: string;
  sku: string | null;
  barcode: string | null;
  archivedAt: string;
};

export const archivedProductListQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  limit: z.coerce.number().int().positive().max(100).catch(50),
  search: z.string().trim().max(200).catch(''),
});

export type ArchivedProductsPage = {
  items: ArchivedProduct[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

function serializeArchivedProducts(
  rows: Array<{
    id: number;
    title: string;
    sku: string | null;
    barcode: string | null;
    archivedAt: Date | null;
  }>,
) {
  return rows.flatMap((row) =>
    row.archivedAt ? [{ ...row, archivedAt: row.archivedAt.toISOString() }] : [],
  );
}

export async function loadArchivedProductsPage(
  db: Database,
  input: Partial<z.input<typeof archivedProductListQuerySchema>> = {},
): Promise<ArchivedProductsPage> {
  const query = archivedProductListQuerySchema.parse(input);
  const search = query.search ? `%${query.search}%` : null;
  const where = and(
    isNotNull(products.archivedAt),
    search
      ? or(
          ilike(products.title, search),
          ilike(products.sku, search),
          ilike(products.barcode, search),
        )
      : undefined,
  );
  const [{ value: totalItems = 0 }] = await db
    .select({ value: count() })
    .from(products)
    .where(where);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .where(where)
    .orderBy(desc(products.archivedAt), desc(products.id))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  return {
    items: serializeArchivedProducts(rows),
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function loadArchivedProductsByIds(
  db: Database,
  productIds: readonly number[],
): Promise<ArchivedProduct[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .where(and(isNotNull(products.archivedAt), inArray(products.id, ids)))
    .orderBy(desc(products.archivedAt), desc(products.id));
  return serializeArchivedProducts(rows);
}
