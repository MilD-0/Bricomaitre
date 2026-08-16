import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontBrands } from '@bric/storefront-core/catalog';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const loadBrands = createServerCache({
  keyParts: ['storefront-brands'],
  revalidate: 3600,
  tags: [CACHE_TAGS.productsMeta],
  load: async () => readStorefrontBrands(getDb()),
});

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ items: [] });
  }

  return NextResponse.json({ items: await loadBrands() });
}
