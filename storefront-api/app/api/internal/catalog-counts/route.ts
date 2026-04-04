import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontCatalogCounts } from '@bric/storefront-core/catalog';

import { getStorefrontApiDeployToken, isValidDeployToken } from '../../../../lib/internal-deploy';

export async function GET(request: NextRequest) {
  const deployToken = getStorefrontApiDeployToken();

  if (!deployToken) {
    return NextResponse.json({ error: 'deploy token is not configured' }, { status: 503 });
  }

  if (!isValidDeployToken(request.headers.get('x-deploy-token'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!hasDb()) {
    return NextResponse.json({ productCount: 0, brandCount: 0, categoryCount: 0 });
  }

  return NextResponse.json(await readStorefrontCatalogCounts(getDb()));
}
