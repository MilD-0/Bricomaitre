import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontEcotrackCatalog } from '@bric/storefront-core/ecotrack-catalog';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null });
  }

  applyServerCache(
    { stale: 300, revalidate: 3600, expire: 86400 },
    CACHE_TAGS.ecotrackCatalog,
  );

  const response = NextResponse.json(await readStorefrontEcotrackCatalog(getDb()));
  response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  return response;
}
