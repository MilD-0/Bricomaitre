import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const trackingLookupSchema = z.object({
  token: z.string().trim().min(20).max(200),
});
const PRIVATE_ORDER_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
};

export async function POST(request: NextRequest) {
  const parsed = trackingLookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_order_lookup' },
      { status: 400, headers: PRIVATE_ORDER_HEADERS },
    );
  }

  try {
    const upstream = await fetchStorefrontUpstream('/storefront/orders/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': request.headers.get('x-real-ip') ?? '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      },
      body: JSON.stringify({ token: parsed.data.token }),
      cache: 'no-store',
      timeoutMs: 6_000,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...PRIVATE_ORDER_HEADERS,
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json(
        { error: 'order_verification_unavailable' },
        { status: 503, headers: PRIVATE_ORDER_HEADERS },
      );
    }
    throw error;
  }
}
