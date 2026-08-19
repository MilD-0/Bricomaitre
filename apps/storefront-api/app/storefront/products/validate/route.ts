import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductsByIds } from '@bric/storefront-core/catalog';
import { storefrontCartValidationRequestSchema } from '@bric/storefront-core/contracts';

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

  const items = await readStorefrontProductsByIds(getDb(), parsed.data.productIds);
  return NextResponse.json({ items });
}
