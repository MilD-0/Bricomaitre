import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductBuildFeed } from '@bric/storefront-core/catalog';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadBuildFeed = unstable_cache(
  async () => readStorefrontProductBuildFeed(getDb()),
  ['storefront-product-build-feed'],
  { revalidate: 300, tags: [CACHE_TAGS.products] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  return NextResponse.json({ items: await loadBuildFeed() });
}
