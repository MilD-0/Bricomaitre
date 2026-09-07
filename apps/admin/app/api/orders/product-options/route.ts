import { and, asc, desc, ilike, isNull, or, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { requireMutationAccess } from '@/lib/rbac';

const querySchema = z.object({
  search: z.string().trim().max(200),
  limit: z.coerce.number().int().min(1).max(20),
});

export async function GET(request: NextRequest) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  const parsed = querySchema.safeParse({
    search: request.nextUrl.searchParams.get('search') ?? '',
    limit: request.nextUrl.searchParams.get('limit') ?? 8,
  });
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid product lookup.' }, { status: 400 });
  if (!parsed.data.search) return NextResponse.json({ items: [] });
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });

  const { search, limit } = parsed.data;
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  // Operators need sellable identity and price, not catalog management or analytics data.
  const items = await getDb()
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      price: products.price,
      images: products.images,
      sku: products.sku,
      barcode: products.barcode,
      mongoId: products.mongoId,
      brandId: products.brandId,
    })
    .from(products)
    .where(
      and(
        isNull(products.archivedAt),
        or(
          ilike(products.title, pattern),
          ilike(products.titleAr, pattern),
          ilike(products.sku, pattern),
          ilike(products.barcode, pattern),
        ),
      ),
    )
    .orderBy(
      desc(
        sql`case when ${products.sku} = ${search} or ${products.barcode} = ${search} then 1 else 0 end`,
      ),
      asc(products.title),
      asc(products.id),
    )
    .limit(limit);
  return NextResponse.json({ items });
}
