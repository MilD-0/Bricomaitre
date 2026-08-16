import { getDb, hasDb } from '@bric/db/client';
import { readPublishedStorefrontLandingPage } from '@bric/storefront-core/landing-page-records';
import {
  landingPageLocaleSchema,
  landingPageSlugSchema,
  storefrontLandingPageResponseSchema,
} from '@bric/storefront-core/landing-pages';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const slug = landingPageSlugSchema.safeParse((await params).slug);
  const locale = landingPageLocaleSchema.safeParse(request.nextUrl.searchParams.get('locale'));
  if (!slug.success || !locale.success)
    return NextResponse.json({ error: 'Invalid landing page lookup.' }, { status: 400 });
  if (!hasDb())
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  const page = await loadLandingPage(slug.data, locale.data);
  if (!page) return NextResponse.json({ error: 'Landing page not found.' }, { status: 404 });
  return NextResponse.json(storefrontLandingPageResponseSchema.parse(page));
}
const loadLandingPage = createServerCache({
  keyParts: ['storefront-landing-page'],
  revalidate: 120,
  tags: [CACHE_TAGS.landingPages, CACHE_TAGS.products],
  load: async (slug: string, locale: string) =>
    readPublishedStorefrontLandingPage(getDb(), { slug, locale }),
});
