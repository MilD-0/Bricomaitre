import { NextRequest, NextResponse } from 'next/server';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const MAX_ANALYTICS_BODY_BYTES = 16_384;

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ANALYTICS_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  try {
    const upstream = await fetchStorefrontUpstream('/storefront/analytics', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-storefront-meta-proxy-secret': process.env.STOREFRONT_META_PROXY_SECRET ?? '',
        'x-real-ip': request.headers.get('x-real-ip') ?? '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'user-agent': request.headers.get('user-agent') ?? '',
      },
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
