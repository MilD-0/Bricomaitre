import { NextRequest } from 'next/server';

import { proxyStorefrontRequest } from '../../../../lib/storefront-proxy';

export async function POST(req: NextRequest) {
  // Deprecated compatibility adapter. Canonical storefront runtime lives in storefront-api.
  return proxyStorefrontRequest({ pathname: '/api/storefront/orders', method: 'POST', request: req });
}
