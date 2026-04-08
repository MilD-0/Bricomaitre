import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductBuildFeed } from '@bric/storefront-core/catalog';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, CACHE_TAGS.products);

  return NextResponse.json({ items: await readStorefrontProductBuildFeed(getDb()) });
}
