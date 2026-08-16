import { NextRequest, NextResponse } from 'next/server';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const MAX_ORDER_BODY_BYTES = 32_768;

function forwardedHeaders(upstream: Response) {
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  });
  for (const name of ['retry-after', 'x-request-id']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ORDER_BODY_BYTES) {
    return NextResponse.json({ error: 'order_payload_too_large' }, { status: 413 });
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 });
  }
  try {
    const upstream = await fetchStorefrontUpstream('/storefront/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-storefront-meta-proxy-secret': process.env.STOREFRONT_META_PROXY_SECRET ?? '',
        'x-real-ip': request.headers.get('x-real-ip') ?? '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'user-agent': request.headers.get('user-agent') ?? '',
        cookie: request.headers.get('cookie') ?? '',
        origin: request.headers.get('origin') ?? '',
        host: request.headers.get('host') ?? '',
      },
      body,
      cache: 'no-store',
      timeoutMs: 10_000,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json({ error: 'order_service_unavailable' }, { status: 503 });
    }
    throw error;
  }
}
