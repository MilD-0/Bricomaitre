import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontAssets } from '@bric/storefront-core/assets';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ banners: [], featuredGroups: [], productCards: [] });
  }

  return NextResponse.json(await readStorefrontAssets(getDb()));
}
