import { NextRequest, NextResponse } from 'next/server';

import { enqueueLightweightJob } from '@bric/runtime/jobs';
import { hasDb } from '@bric/db/client';
import { storefrontAnalyticsEventSchema } from '@bric/storefront-core/analytics';

import { buildRateLimitHeaders, enforceRequestRateLimit } from '../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../lib/sentry';

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

  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-analytics',
    limit: 120,
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

  let payload: unknown;
  try {
    payload = await req.json();
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
