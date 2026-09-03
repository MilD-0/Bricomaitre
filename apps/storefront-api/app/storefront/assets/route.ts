import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontAssets } from '@bric/storefront-core/assets';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const loadAssets = createServerCache({
  keyParts: ['storefront-assets'],
  revalidate: 120,
  tags: [CACHE_TAGS.assets],
  load: async () => readStorefrontAssets(getDb()),
});

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  return NextResponse.json(await loadAssets());
}
