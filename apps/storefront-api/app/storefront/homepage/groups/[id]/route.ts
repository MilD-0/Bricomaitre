import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontHomepageFeaturedGroupProductsQuerySchema } from '@bric/storefront-core/contracts';
import { readStorefrontHomepageFeaturedGroupProducts } from '@bric/storefront-core/assets';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

const loadGroup = unstable_cache(
  async (groupId: number, page: number, limit: number) =>
    readStorefrontHomepageFeaturedGroupProducts(getDb(), groupId, page, limit),
  ['storefront-homepage-group'],
  { revalidate: 120, tags: [CACHE_TAGS.assets, CACHE_TAGS.products, CACHE_TAGS.productsMeta] },
);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = parsePositiveIntegerId(id);
  if (groupId === null) {
    return NextResponse.json({ error: 'Invalid featured group id.' }, { status: 400 });
  }

  const parsed = storefrontHomepageFeaturedGroupProductsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid product page query.' }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  const result = await loadGroup(groupId, parsed.data.page, parsed.data.limit);
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ error: 'Featured group not found.' }, { status: 404 });
}
