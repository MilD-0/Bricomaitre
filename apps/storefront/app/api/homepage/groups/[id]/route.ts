import { NextRequest, NextResponse } from 'next/server';

import { fetchStorefrontHomepageFeaturedGroupProducts } from '@/lib/storefront-api';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId < 1) {
    return NextResponse.json({ error: 'Invalid featured group id.' }, { status: 400 });
  }

  try {
    const result = await fetchStorefrontHomepageFeaturedGroupProducts(groupId, {
      page: Number(request.nextUrl.searchParams.get('page') ?? 1),
      limit: Number(request.nextUrl.searchParams.get('limit') ?? 12),
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Featured products are temporarily unavailable.' },
      { status: 503 },
    );
  }
}
