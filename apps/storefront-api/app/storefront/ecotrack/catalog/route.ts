import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontEcotrackCatalog } from '@bric/storefront-core/ecotrack-catalog';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const loadCatalog = createServerCache({
  keyParts: ['storefront-ecotrack-catalog'],
  revalidate: 3600,
  tags: [CACHE_TAGS.ecotrackCatalog],
  load: async () => readStorefrontEcotrackCatalog(getDb()),
});

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({
      wilayas: [],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  }

  const response = NextResponse.json(await loadCatalog());
  response.headers.set(
    'Cache-Control',
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  );
  return response;
}
