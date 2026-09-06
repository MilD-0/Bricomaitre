import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontBrands } from '@bric/storefront-core/catalog';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadBrands = unstable_cache(
  async () => readStorefrontBrands(getDb()),
  ['storefront-brands'],
  { revalidate: 3600, tags: [CACHE_TAGS.productsMeta] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  return NextResponse.json({ items: await loadBrands() });
}
