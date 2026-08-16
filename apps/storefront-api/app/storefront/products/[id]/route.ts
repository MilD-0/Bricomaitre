import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontProductByToken } from '@bric/storefront-core/catalog';
import {
  storefrontProductDetailResponseSchema,
  storefrontProductTokenSchema,
} from '@bric/storefront-core/contracts';

type ProductRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: ProductRouteContext) {
  const parsedToken = storefrontProductTokenSchema.safeParse((await params).id);
  if (!parsedToken.success) {
    return NextResponse.json({ error: 'Invalid product token.' }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  const product = await readStorefrontProductByToken(getDb(), parsedToken.data);
  if (!product) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  }

  return NextResponse.json(storefrontProductDetailResponseSchema.parse(product));
}
