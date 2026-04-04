import { proxyStorefrontRequest } from '../../../../lib/storefront-proxy';

export async function GET() {
  // Deprecated compatibility adapter. Canonical storefront runtime lives in storefront-api.
  return proxyStorefrontRequest({ pathname: '/api/storefront/assets', method: 'GET' });
}
