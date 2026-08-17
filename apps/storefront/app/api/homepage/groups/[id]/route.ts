import { NextRequest, NextResponse } from 'next/server';

import { storefrontHomepageFeaturedGroupProductsQuerySchema } from '@bric/storefront-core/contracts';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { fetchStorefrontHomepageFeaturedGroupProducts } from '@/lib/storefront-api';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = parsePositiveIntegerId(id);
  if (groupId === null) {
    return NextResponse.json({ error: 'Invalid featured group id.' }, { status: 400 });
  }

  const query = storefrontHomepageFeaturedGroupProductsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: 'Invalid product page query.' }, { status: 400 });
  }

  try {
    const result = await fetchStorefrontHomepageFeaturedGroupProducts(groupId, query.data);
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
