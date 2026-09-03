import { NextRequest, NextResponse } from 'next/server';

import { enqueueLightweightJob } from '@bric/runtime/jobs';
import { hasDb } from '@bric/db/client';
import { storefrontAnalyticsEventSchema } from '@bric/storefront-core/analytics';

import {
  buildRateLimitHeaders,
  enforceGlobalRateLimit,
  enforceRequestRateLimit,
} from '../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../lib/sentry';
import { hasTrustedStorefrontProxySecret } from '../../../lib/meta-request';

const MAX_ANALYTICS_BODY_BYTES = 16_384;

export function isAutomatedAnalyticsRequest(req: Pick<NextRequest, 'headers'>) {
  const userAgent = req.headers.get('user-agent')?.toLowerCase() ?? '';
  return /(?:bot|crawler|headlesschrome|lighthouse|playwright|spider|synthetic)/.test(userAgent);
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  if (!hasTrustedStorefrontProxySecret(req)) {
    return NextResponse.json(
      { error: 'Analytics proxy authorization is required.' },
      { status: 403, headers: withRequestIdHeaders(requestId) },
    );
  }

  const globalRateLimit = await enforceGlobalRateLimit({
    scope: 'storefront-analytics-global',
    limit: 1_200,
    windowSeconds: 60,
  });
  if (!globalRateLimit.ok) {
    return NextResponse.json(
      { error: 'Analytics ingestion is busy.' },
      {
        status: 429,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(globalRateLimit)),
      },
    );
  }

  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-analytics',
    limit: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many analytics requests.' },
      {
        status: 429,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  }

  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ANALYTICS_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Analytics request is too large.' },
      { status: 413, headers: withRequestIdHeaders(requestId) },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body.' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const parsed = storefrontAnalyticsEventSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  if (isAutomatedAnalyticsRequest(req)) {
    return NextResponse.json(
      { ok: true, queued: false, filtered: 'automation' },
      { headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)) },
    );
  }

  if (parsed.data.eventName === 'purchase') {
    return NextResponse.json(
      { ok: true, queued: false, filtered: 'server_authoritative' },
      { headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)) },
    );
  }

  try {
    const queued = await enqueueLightweightJob({
      queueName: 'storefront-analytics',
      jobName: 'analytics-event',
      dedupeKey: parsed.data.eventId,
      data: { event: parsed.data },
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        deduped: queued.kind === 'existing',
      },
      {
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-analytics-ingest',
      route: '/storefront/analytics',
      context: {
        eventId: parsed.data.eventId,
        eventName: parsed.data.eventName,
      },
    });

    throw error;
  }
}
