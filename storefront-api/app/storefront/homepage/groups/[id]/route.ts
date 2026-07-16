import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import {
  storefrontHomepageFeaturedGroupProductsQuerySchema,
} from '@bric/storefront-core/contracts';
import { readStorefrontHomepageFeaturedGroupProducts } from '@bric/storefront-core/assets';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

const emptyPage = { items: [], total: 0 };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId < 1) {
    return NextResponse.json({ error: 'Invalid featured group id.' }, { status: 400 });
  }

  const parsed = storefrontHomepageFeaturedGroupProductsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid product page query.' }, { status: 400 });
  }

  if (!hasDb()) return NextResponse.json(emptyPage);

  applyServerCache({ stale: 30, revalidate: 120, expire: 600 }, CACHE_TAGS.assets, CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  const result = await readStorefrontHomepageFeaturedGroupProducts(getDb(), groupId, parsed.data.page, parsed.data.limit);
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: 'Featured group not found.' }, { status: 404 });
}
