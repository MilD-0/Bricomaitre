import { NextRequest, NextResponse } from "next/server";
import * as Sentry from '@sentry/nextjs';

import { startOwnedJob } from "@bric/runtime/jobs";
import { getDb, hasDb } from "@bric/db/client";
import {
  storefrontAnalyticsEventSchema,
} from "@bric/storefront-core/analytics";

import { buildRateLimitHeaders, enforceRequestRateLimit } from "../../../lib/request-security";
import { captureStorefrontApiException, getRequestId, withRequestIdHeaders } from "../../../lib/sentry";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503, headers: withRequestIdHeaders(requestId) });
  }

  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-analytics',
    limit: 120,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ error: 'Too many analytics requests.' }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
  }

  const parsed = storefrontAnalyticsEventSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  try {
    const queued = await startOwnedJob({
      queueName: 'storefront-analytics',
      kind: 'analytics-event',
      ownerKey: parsed.data.eventId,
      requestId,
      data: { event: parsed.data },
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      deduped: queued.kind === 'existing',
    }, {
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
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
