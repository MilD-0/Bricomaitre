import { NextResponse } from 'next/server';

import { getAdminEnvHealth } from '../../../lib/env-health';
import { getRequestId, withRequestIdHeaders } from '../../../lib/sentry';
import { getStorefrontApiBaseUrl } from '../../../lib/storefront-proxy';

async function getStorefrontUpstreamHealth(baseUrl: string) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `health_${Date.now()}`;

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });

    return {
      ok: response.ok,
      status: response.status,
      baseUrl,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      baseUrl,
      error: error instanceof Error ? error.message : 'Unknown storefront upstream error',
    };
  }
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const env = getAdminEnvHealth();
  const storefrontApi = await getStorefrontUpstreamHealth(getStorefrontApiBaseUrl());
  const ok = env.ok && storefrontApi.ok;

  return NextResponse.json({
    status: ok ? 'ok' : 'degraded',
    service: 'admin',
    timestamp: new Date().toISOString(),
    checks: {
      env: env.checks,
      storefrontApi,
    },
    missingEnv: env.missing,
  }, {
    status: ok ? 200 : 503,
    headers: withRequestIdHeaders(requestId),
  });
}
