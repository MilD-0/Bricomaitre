import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontAssets } from '@bric/storefront-core/assets';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadAssets = unstable_cache(
  async () => readStorefrontAssets(getDb()),
  ['storefront-assets'],
  { revalidate: 120, tags: [CACHE_TAGS.assets] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  return NextResponse.json(await loadAssets());
}
