import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { countStorefrontProducts, readStorefrontProducts } from '@bric/storefront-core/catalog';
import { storefrontProductListQuerySchema } from '@bric/storefront-core/contracts';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ items: [], total: 0 });
  }

  applyServerCache(
    { stale: 60, revalidate: 300, expire: 3600 },
    CACHE_TAGS.products,
    CACHE_TAGS.assets,
  );

  const query = storefrontProductListQuerySchema.parse({
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    id: req.nextUrl.searchParams.get('id'),
    mongoId: req.nextUrl.searchParams.get('mongoId') ?? undefined,
    search: req.nextUrl.searchParams.get('search') ?? undefined,
    brandId: req.nextUrl.searchParams.get('brandId'),
    categoryId: req.nextUrl.searchParams.get('categoryId'),
    discounted: req.nextUrl.searchParams.get('discounted') ?? undefined,
    sortKey: req.nextUrl.searchParams.get('sortKey') ?? undefined,
    sortDirection: req.nextUrl.searchParams.get('sortDirection') ?? undefined,
    slug: req.nextUrl.searchParams.get('slug') ?? undefined,
  });

  const db = getDb();
  const [items, total] = await Promise.all([
    readStorefrontProducts(db, query),
    countStorefrontProducts(db, query),
  ]);

  return NextResponse.json({ items, total });
}
