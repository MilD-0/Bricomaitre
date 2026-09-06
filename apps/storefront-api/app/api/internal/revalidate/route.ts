import { NextRequest, NextResponse } from 'next/server';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';
import { storefrontRevalidationRequestSchema } from '@bric/storefront-core/contracts';
import { CACHE_TAGS, revalidateServerTags } from '@bric/storefront-core/server-cache';

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
    return NextResponse.json({ error: 'Unsupported revalidation scope' }, { status: 400 });
  }

  const tag =
    parsed.data.scope === 'settings'
      ? CACHE_TAGS.storefrontSettings
      : parsed.data.scope === 'landing-pages'
        ? CACHE_TAGS.landingPages
        : parsed.data.scope === 'products'
          ? CACHE_TAGS.products
          : parsed.data.scope === 'product-meta'
            ? CACHE_TAGS.productsMeta
            : CACHE_TAGS.assets;
  revalidateServerTags(tag);

  return NextResponse.json({ ok: true, revalidated: [tag] });
}
