import { NextResponse } from 'next/server';

import { getStorefrontApiHealth } from '../../../lib/health';
import { getRequestId, withRequestIdHeaders } from '../../../lib/sentry';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const health = await getStorefrontApiHealth();

  return NextResponse.json(
    {
      status: health.ok ? 'ok' : 'degraded',
      service: 'storefront-api',
      release: process.env.SENTRY_RELEASE?.trim() || 'unknown',
      timestamp: new Date().toISOString(),
    },
    {
      status: health.ok ? 200 : 503,
      headers: withRequestIdHeaders(requestId),
    },
  );
}
