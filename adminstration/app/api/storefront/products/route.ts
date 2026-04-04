import { NextRequest } from 'next/server';

import { proxyStorefrontRequest } from '../../../../lib/storefront-proxy';

export async function GET(req: NextRequest) {
  // Deprecated compatibility adapter. Canonical storefront runtime lives in storefront-api.
  return proxyStorefrontRequest({ pathname: '/api/storefront/products', method: 'GET', request: req });
}
