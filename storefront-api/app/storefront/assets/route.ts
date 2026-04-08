import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontAssets } from '@bric/storefront-core/assets';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ banners: [], featuredGroups: [], productCards: [] });
  }

  applyServerCache({ stale: 30, revalidate: 120, expire: 600 }, CACHE_TAGS.assets);

  return NextResponse.json(await readStorefrontAssets(getDb()));
}
