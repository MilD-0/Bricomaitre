import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readActiveProductPromo } from '@bric/storefront-core/promos';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const productId = parsePositiveIntegerId(id);

  if (productId === null) {
    return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });
  }

  const promo = await readActiveProductPromo(getDb(), {
    productId,
    code: req.nextUrl.searchParams.get('code'),
  });

  return NextResponse.json({
    ok: promo !== null,
    promo,
  });
}
