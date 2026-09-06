import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontHomepage } from '@bric/storefront-core/assets';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadHomepage = unstable_cache(
  async () => readStorefrontHomepage(getDb()),
  ['storefront-homepage'],
  { revalidate: 120, tags: [CACHE_TAGS.assets, CACHE_TAGS.products, CACHE_TAGS.productsMeta] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }
  return NextResponse.json(await loadHomepage());
}
