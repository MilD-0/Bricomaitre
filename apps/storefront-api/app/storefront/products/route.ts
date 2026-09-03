import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { countStorefrontProducts, readStorefrontProducts } from '@bric/storefront-core/catalog';
import { storefrontProductListQuerySchema } from '@bric/storefront-core/contracts';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

type ProductQuery = Parameters<typeof readStorefrontProducts>[1];
const loadProducts = createServerCache({
  keyParts: ['storefront-products'],
  revalidate: 300,
  tags: [CACHE_TAGS.products, CACHE_TAGS.assets],
  load: async (query: ProductQuery) => {
    const db = getDb();
    const [items, total] = await Promise.all([
      readStorefrontProducts(db, query),
      countStorefrontProducts(db, query),
    ]);
    return { items, total };
  },
});

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  const parsed = storefrontProductListQuerySchema.safeParse({
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    id: req.nextUrl.searchParams.get('id'),
    mongoId: req.nextUrl.searchParams.get('mongoId') ?? undefined,
    search: req.nextUrl.searchParams.get('search') ?? undefined,
    brandId: req.nextUrl.searchParams.get('brandId'),
    categoryId: req.nextUrl.searchParams.get('categoryId'),
    discounted: req.nextUrl.searchParams.get('discounted') ?? undefined,
    stock: req.nextUrl.searchParams.get('stock') ?? undefined,
    minPrice: req.nextUrl.searchParams.get('minPrice'),
    maxPrice: req.nextUrl.searchParams.get('maxPrice'),
    sortKey: req.nextUrl.searchParams.get('sortKey') ?? undefined,
    sortDirection: req.nextUrl.searchParams.get('sortDirection') ?? undefined,
    slug: req.nextUrl.searchParams.get('slug') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid product query.' }, { status: 400 });
  }

  return NextResponse.json(await loadProducts(parsed.data));
}
