import { NextRequest, NextResponse } from 'next/server';

import {
  fetchStorefrontUpstream,
  isStorefrontUpstreamError,
} from '@/lib/storefront-upstream';

const MAX_ANALYTICS_BODY_BYTES = 16_384;

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ANALYTICS_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  try {
    const upstream = await fetchStorefrontUpstream('/storefront/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: 2_000,
      cache: 'no-store',
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json({ ok: false, accepted: true }, { status: 202 });
    }
    throw error;
  }
}
