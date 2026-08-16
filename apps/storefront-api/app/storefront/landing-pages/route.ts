import { getDb, hasDb } from '@bric/db/client';
import { readIndexableStorefrontLandingPages } from '@bric/storefront-core/landing-page-records';
import { storefrontLandingPageSitemapResponseSchema } from '@bric/storefront-core/landing-pages';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';
import { NextResponse } from 'next/server';

const loadLandingPages = createServerCache({
  keyParts: ['storefront-landing-pages'],
  revalidate: 3600,
  tags: [CACHE_TAGS.landingPages, CACHE_TAGS.products],
  load: async () => readIndexableStorefrontLandingPages(getDb()),
});

export async function GET() {
  if (!hasDb()) return NextResponse.json({ items: [] });
  return NextResponse.json(
    storefrontLandingPageSitemapResponseSchema.parse({ items: await loadLandingPages() }),
  );
}
