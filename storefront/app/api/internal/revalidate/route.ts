import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';
import { STOREFRONT_CACHE_TAGS } from '@/lib/cache-tags';

function getRevalidateSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
}

export async function POST(request: NextRequest) {
  const secret = getRevalidateSecret();

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

  let parsed: { scope?: string };

  try {
    parsed = JSON.parse(bodyText) as { scope?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid revalidation payload' }, { status: 400 });
  }

  if (parsed.scope !== 'assets') {
    return NextResponse.json({ error: 'Unsupported revalidation scope' }, { status: 400 });
  }

  revalidateTag(STOREFRONT_CACHE_TAGS.assets, 'max');
  revalidateTag(STOREFRONT_CACHE_TAGS.catalogContext, 'max');

  return NextResponse.json({
    ok: true,
    revalidated: [
      STOREFRONT_CACHE_TAGS.assets,
      STOREFRONT_CACHE_TAGS.catalogContext,
    ],
  });
}
