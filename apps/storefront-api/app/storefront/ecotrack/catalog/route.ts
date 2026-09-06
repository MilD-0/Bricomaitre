import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontEcotrackCatalog } from '@bric/storefront-core/ecotrack-catalog';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadCatalog = unstable_cache(
  async () => readStorefrontEcotrackCatalog(getDb()),
  ['storefront-ecotrack-catalog'],
  { revalidate: 3600, tags: [CACHE_TAGS.ecotrackCatalog] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  const response = NextResponse.json(await loadCatalog());
  response.headers.set(
    'Cache-Control',
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  );
  return response;
}
