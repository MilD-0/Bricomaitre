import { NextRequest, NextResponse } from 'next/server';
import { count, desc, eq, gt, ilike, or } from 'drizzle-orm';

import { getDb, hasDb } from '../../../db/client';
import { products } from '../../../db/schema';
import { paginationQuerySchema } from '../../../lib/inventory';
import { requireMutationAccess } from '../../../lib/rbac';

export async function GET(req: NextRequest) {
  const denied = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  const query = paginationQuerySchema.parse({
    page: req.nextUrl.searchParams.get('page') ?? '1',
    limit: req.nextUrl.searchParams.get('limit') ?? '50',
    search: req.nextUrl.searchParams.get('search') ?? req.nextUrl.searchParams.get('q') ?? '',
  });
  const search = query.search.trim();

  if (!hasDb()) {
    return NextResponse.json({
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
    });
  }

  const searchFilter = search
    ? or(
      eq(products.barcode, search),
      ilike(products.title, `%${search}%`),
      ilike(products.sku, `%${search}%`),
    )
    : gt(products.inventoryQuantity, 0);

  const [{ value: totalItems }] = await getDb()
    .select({ value: count() })
    .from(products)
    .where(searchFilter);

  const rows = await getDb()
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
    .orderBy(desc(products.updatedAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));

  return NextResponse.json({
    writable: true,
    items: rows,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  });
}
