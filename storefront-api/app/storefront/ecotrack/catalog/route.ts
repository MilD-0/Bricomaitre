import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontEcotrackCatalog } from '@bric/storefront-core/ecotrack-catalog';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null });
  }

  return NextResponse.json(await readStorefrontEcotrackCatalog(getDb()));
}
