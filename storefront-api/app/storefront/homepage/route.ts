import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontHomepage } from '@bric/storefront-core/assets';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

const emptyHomepage = { banners: [], topProducts: [], categories: [], productCards: [], brands: [], featuredGroups: [] };

export async function GET() {
  if (!hasDb()) return NextResponse.json(emptyHomepage);
  applyServerCache({ stale: 30, revalidate: 120, expire: 600 }, CACHE_TAGS.assets, CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  return NextResponse.json(await readStorefrontHomepage(getDb()));
}
