import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProducts } from '@bric/storefront-core/catalog';
import { storefrontProductListQuerySchema } from '@bric/storefront-core/contracts';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.products);

  const query = storefrontProductListQuerySchema.parse({
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    id: req.nextUrl.searchParams.get('id'),
    mongoId: req.nextUrl.searchParams.get('mongoId') ?? undefined,
    search: req.nextUrl.searchParams.get('search') ?? undefined,
    brandId: req.nextUrl.searchParams.get('brandId'),
    categoryId: req.nextUrl.searchParams.get('categoryId'),
    sortKey: req.nextUrl.searchParams.get('sortKey') ?? undefined,
    sortDirection: req.nextUrl.searchParams.get('sortDirection') ?? undefined,
    slug: req.nextUrl.searchParams.get('slug') ?? undefined,
  });

  return NextResponse.json({ items: await readStorefrontProducts(getDb(), query) });
}
