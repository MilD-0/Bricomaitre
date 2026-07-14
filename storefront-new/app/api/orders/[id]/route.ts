import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchStorefrontUpstream, isStorefrontUpstreamError } from '@/lib/storefront-upstream';

const orderLookupSchema = z.object({
  id: z.coerce.number().int().positive(),
  token: z.string().trim().min(20).max(200),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = orderLookupSchema.safeParse({
    id: (await params).id,
    token: request.nextUrl.searchParams.get('token'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'invalid_order_lookup' }, { status: 400 });
  try {
    const upstream = await fetchStorefrontUpstream(
      `/storefront/orders/${parsed.data.id}?token=${encodeURIComponent(parsed.data.token)}`,
      { cache: 'no-store', timeoutMs: 6_000 },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error) {
    if (isStorefrontUpstreamError(error)) {
      return NextResponse.json({ error: 'order_verification_unavailable' }, { status: 503 });
    }
    throw error;
  }
}
