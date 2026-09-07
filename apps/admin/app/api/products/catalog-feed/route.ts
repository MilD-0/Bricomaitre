import { NextRequest, NextResponse } from 'next/server';

import { PRODUCT_CATALOG_FEED_OBJECT_KEY } from '@/lib/background-jobs';
import { getStableArtifactUrl } from '@/lib/export-artifacts';

function getConfiguredToken() {
  const token = process.env.PRODUCT_CATALOG_FEED_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

export async function GET(request: NextRequest) {
  const configuredToken = getConfiguredToken();
  const providedToken = request.nextUrl.searchParams.get('token')?.trim() ?? null;

  if (configuredToken && providedToken !== configuredToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(getStableArtifactUrl(PRODUCT_CATALOG_FEED_OBJECT_KEY));
}
