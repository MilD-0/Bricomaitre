import { NextRequest, NextResponse } from 'next/server';

import {
  CATALOG_PAGE_SIZE,
  parseCatalogBatchSize,
  parseCatalogPageQuery,
  toStorefrontCatalogQuery,
} from '@/lib/catalog-query';
import { fetchStorefrontCatalog } from '@/lib/storefront-api';

export async function GET(request: NextRequest) {
  const query = parseCatalogPageQuery(Object.fromEntries(request.nextUrl.searchParams));
  const batchSize = parseCatalogBatchSize(
    request.nextUrl.searchParams.get('limit') ?? CATALOG_PAGE_SIZE,
  );
  const upstreamQuery = { ...toStorefrontCatalogQuery(query), limit: batchSize };

  return fetchStorefrontCatalog(upstreamQuery)
    .then((response) =>
      NextResponse.json({
        items: response.items.slice(0, batchSize),
        total: response.total,
        page: query.page,
        hasNextPage: query.page * batchSize < response.total,
      }),
    )
    .catch(() => NextResponse.json({ error: 'catalog_unavailable' }, { status: 503 }));
}
