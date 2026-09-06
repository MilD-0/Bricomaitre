import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { storefrontRevalidationRequestSchema } from '@bric/storefront-core/contracts';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';

import { getStorefrontProductCacheTag, STOREFRONT_CACHE_TAGS } from '@/lib/cache-tags';

export async function POST(request: NextRequest) {
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
  if (!secret) {
    return NextResponse.json({ error: 'revalidation secret is not configured' }, { status: 503 });
  }

  const bodyText = await request.text();
  const verification = verifyInternalRequestSignature({
    payload: bodyText,
    secret,
    timestamp: request.headers.get('x-revalidate-timestamp'),
    signature: request.headers.get('x-revalidate-signature'),
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'Invalid revalidation payload' }, { status: 400 });
  }

  const parsed = storefrontRevalidationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unsupported revalidation payload' }, { status: 400 });
  }

  const tags =
    parsed.data.scope === 'assets'
      ? [STOREFRONT_CACHE_TAGS.assets]
      : parsed.data.scope === 'product-meta'
        ? [STOREFRONT_CACHE_TAGS.productMeta]
        : parsed.data.scope === 'settings'
          ? [STOREFRONT_CACHE_TAGS.settings]
          : parsed.data.scope === 'landing-pages'
            ? [STOREFRONT_CACHE_TAGS.landingPages]
            : [
                STOREFRONT_CACHE_TAGS.products,
                ...new Set((parsed.data.tokens ?? []).map(getStorefrontProductCacheTag)),
              ];
  tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));

  return NextResponse.json({ ok: true, revalidated: tags });
}
