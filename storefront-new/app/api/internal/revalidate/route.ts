import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';

import {
  getStorefrontProductCacheTag,
  STOREFRONT_NEW_CACHE_TAGS,
} from '@/lib/cache-tags';

const revalidationPayloadSchema = z.object({
  scope: z.enum(['products', 'settings', 'landing-pages']),
  tokens: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

function getRevalidationSecret() {
  return process.env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
}

export async function POST(request: NextRequest) {
  const secret = getRevalidationSecret();
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

  const parsed = revalidationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unsupported revalidation payload' }, { status: 400 });
  }

  const tags = parsed.data.scope === 'settings'
    ? [STOREFRONT_NEW_CACHE_TAGS.settings]
    : parsed.data.scope === 'landing-pages'
      ? [STOREFRONT_NEW_CACHE_TAGS.landingPages]
      : [
        STOREFRONT_NEW_CACHE_TAGS.products,
        ...new Set((parsed.data.tokens ?? []).map(getStorefrontProductCacheTag)),
      ];
  tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));

  return NextResponse.json({ ok: true, revalidated: tags });
}
