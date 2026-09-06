import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductsByIds } from '@bric/storefront-core/catalog';
import { storefrontCartValidationRequestSchema } from '@bric/storefront-core/contracts';
import { resolveOrderPromo } from '@bric/storefront-core/promos';

export async function POST(request: Request) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const parsed = storefrontCartValidationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const [items, promo] = await Promise.all([
    readStorefrontProductsByIds(db, parsed.data.productIds),
    parsed.data.promoCode
      ? resolveOrderPromo(db, {
          cartProducts: parsed.data.productIds.map(String),
          promoCode: parsed.data.promoCode,
        })
      : null,
  ]);
  return NextResponse.json({ items, promo });
}
