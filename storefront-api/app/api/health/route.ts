import { NextResponse } from 'next/server';

import { getStorefrontApiEnvHealth } from '../../../lib/env-health';
import { getRequestId, withRequestIdHeaders } from '../../../lib/sentry';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const env = getStorefrontApiEnvHealth();

  return NextResponse.json({
    status: env.ok ? 'ok' : 'degraded',
    service: 'storefront-api',
    timestamp: new Date().toISOString(),
    checks: env.checks,
    missingEnv: env.missing,
  }, {
    status: env.ok ? 200 : 503,
    headers: withRequestIdHeaders(requestId),
  });
}
