import { unstable_cache } from 'next/cache';
import { getDb, hasDb } from '@bric/db/client';
import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';
import {
  readPublishedStorefrontLandingPage,
  readStorefrontLandingPageRevision,
} from '@bric/storefront-core/landing-page-records';
import {
  buildLandingPagePreviewPayload,
  landingPageLocaleSchema,
  landingPagePreviewSchema,
  landingPageSlugSchema,
  storefrontLandingPageResponseSchema,
} from '@bric/storefront-core/landing-pages';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const slug = landingPageSlugSchema.safeParse((await params).slug);
  const locale = landingPageLocaleSchema.safeParse(request.nextUrl.searchParams.get('locale'));
  if (!slug.success || !locale.success)
    return NextResponse.json({ error: 'Invalid landing page lookup.' }, { status: 400 });
  if (!hasDb())
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });

  const previewValues = {
    revision: request.nextUrl.searchParams.get('previewRevision'),
    timestamp: request.nextUrl.searchParams.get('previewTimestamp'),
    signature: request.nextUrl.searchParams.get('previewSignature'),
  };
  const previewRequested = Object.values(previewValues).some((value) => value !== null);
  let page;
  if (previewRequested) {
    const preview = landingPagePreviewSchema.safeParse(previewValues);
    if (!preview.success)
      return NextResponse.json({ error: 'Invalid landing page preview.' }, { status: 400 });

    const secret = process.env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
    if (!secret)
      return NextResponse.json({ error: 'Landing page preview is unavailable.' }, { status: 503 });
    const verification = verifyInternalRequestSignature({
      payload: buildLandingPagePreviewPayload({
        locale: locale.data,
        slug: slug.data,
        revision: preview.data.revision,
      }),
      secret,
      timestamp: preview.data.timestamp,
      signature: preview.data.signature,
    });
    if (!verification.ok)
      return NextResponse.json({ error: 'Landing page preview has expired.' }, { status: 403 });

    page = await readStorefrontLandingPageRevision(getDb(), {
      slug: slug.data,
      locale: locale.data,
      revision: preview.data.revision,
    });
  } else {
    page = await loadLandingPage(slug.data, locale.data);
  }
  if (!page) return NextResponse.json({ error: 'Landing page not found.' }, { status: 404 });
  return NextResponse.json(storefrontLandingPageResponseSchema.parse(page), {
    headers: previewRequested
      ? { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' }
      : undefined,
  });
}
const loadLandingPage = unstable_cache(
  async (slug: string, locale: string) =>
    readPublishedStorefrontLandingPage(getDb(), { slug, locale }),
  ['storefront-landing-page'],
  { revalidate: 120, tags: [CACHE_TAGS.landingPages, CACHE_TAGS.products] },
);
