import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontBrands } from '@bric/storefront-core/catalog';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  applyServerCache({ stale: 300, revalidate: 3600, expire: 86400 }, CACHE_TAGS.productsMeta);

  return NextResponse.json({ items: await readStorefrontBrands(getDb()) });
}
