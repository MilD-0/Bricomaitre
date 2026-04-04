import { NextRequest } from 'next/server';

import { proxyStorefrontRequest } from '../../../../../lib/storefront-proxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Deprecated compatibility adapter. Canonical storefront runtime lives in storefront-api.
  return proxyStorefrontRequest({ pathname: `/api/storefront/orders/${id}`, method: 'GET', request: req });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Deprecated compatibility adapter. Canonical storefront runtime lives in storefront-api.
  return proxyStorefrontRequest({ pathname: `/api/storefront/orders/${id}`, method: 'PATCH', request: req });
}
