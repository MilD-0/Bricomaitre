import { NextResponse } from 'next/server';

import { storefrontCartValidationRequestSchema } from '@bric/storefront-core/contracts';

import { fetchStorefrontCartValidation } from '@/lib/storefront-api';

export async function POST(request: Request) {
  const parsed = storefrontCartValidationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return fetchStorefrontCartValidation(
    parsed.data.productIds,
    parsed.data.promoCode,
    parsed.data.productPromos,
  )
    .then((response) => NextResponse.json(response))
    .catch(() => NextResponse.json({ error: 'catalog_unavailable' }, { status: 503 }));
}
