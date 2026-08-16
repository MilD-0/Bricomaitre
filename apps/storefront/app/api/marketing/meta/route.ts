import { NextRequest, NextResponse } from 'next/server';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const MAX_BODY_BYTES = 32_768;

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'marketing_payload_too_large' }, { status: 413 });
  }
  try {
    const upstream = await fetchStorefrontUpstream('/storefront/meta/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-storefront-meta-proxy-secret': process.env.STOREFRONT_META_PROXY_SECRET ?? '',
        'x-real-ip': request.headers.get('x-real-ip') ?? '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'user-agent': request.headers.get('user-agent') ?? '',
        cookie: request.headers.get('cookie') ?? '',
        origin: request.headers.get('origin') ?? '',
        host: request.headers.get('host') ?? '',
      },
      body,
      timeoutMs: 5_000,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json({ error: 'marketing_destination_unavailable' }, { status: 503 });
    }
    throw error;
  }
}
