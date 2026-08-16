import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontHomepage } from '@bric/storefront-core/assets';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const emptyHomepage = {
  banners: [],
  topProducts: [],
  categories: [],
  productCards: [],
  brands: [],
  featuredGroups: [],
};
const loadHomepage = createServerCache({
  keyParts: ['storefront-homepage'],
  revalidate: 120,
  tags: [CACHE_TAGS.assets, CACHE_TAGS.products, CACHE_TAGS.productsMeta],
  load: async () => readStorefrontHomepage(getDb()),
});

export async function GET() {
  if (!hasDb()) return NextResponse.json(emptyHomepage);
  return NextResponse.json(await loadHomepage());
}
