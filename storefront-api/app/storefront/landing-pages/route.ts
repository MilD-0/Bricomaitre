import { getDb, hasDb } from '@bric/db/client';
import { readIndexableStorefrontLandingPages } from '@bric/storefront-core/landing-page-records';
import { storefrontLandingPageSitemapResponseSchema } from '@bric/storefront-core/landing-pages';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!hasDb()) return NextResponse.json({ items: [] });
  applyServerCache({ stale: 300, revalidate: 3600, expire: 86400 }, CACHE_TAGS.landingPages);
  return NextResponse.json(storefrontLandingPageSitemapResponseSchema.parse({ items: await readIndexableStorefrontLandingPages(getDb()) }));
}
