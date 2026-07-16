import { NextRequest, NextResponse } from 'next/server';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';
import { CACHE_TAGS, revalidateServerTags } from '@bric/storefront-core/server-cache';

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

  if (parsed.scope !== 'assets' && parsed.scope !== 'settings') {
    return NextResponse.json({ error: 'Unsupported revalidation scope' }, { status: 400 });
  }

  const tag = parsed.scope === 'settings' ? CACHE_TAGS.storefrontSettings : CACHE_TAGS.assets;
  revalidateServerTags(tag);

  return NextResponse.json({ ok: true, revalidated: [tag] });
}
