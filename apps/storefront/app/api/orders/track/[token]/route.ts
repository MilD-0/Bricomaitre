import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const trackingLookupSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const parsed = trackingLookupSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_order_lookup' }, { status: 400 });

  try {
    const upstream = await fetchStorefrontUpstream(
      `/storefront/orders/track/${encodeURIComponent(parsed.data.token)}`,
      { cache: 'no-store', timeoutMs: 6_000 },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        'cache-control': 'private, no-store',
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json({ error: 'order_verification_unavailable' }, { status: 503 });
    }
    throw error;
  }
}
