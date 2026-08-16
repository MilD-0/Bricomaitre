import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductBuildFeed } from '@bric/storefront-core/catalog';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const loadBuildFeed = createServerCache({
  keyParts: ['storefront-product-build-feed'],
  revalidate: 300,
  tags: [CACHE_TAGS.products],
  load: async () => readStorefrontProductBuildFeed(getDb()),
});

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  return NextResponse.json({ items: await loadBuildFeed() });
}
