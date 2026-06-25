import { NextRequest, NextResponse } from "next/server";

import { getDb, hasDb } from "@bric/db/client";
import { metaBrowserEventSchema } from "@bric/storefront-core/meta-contracts";
import { enqueueMetaBrowserEvent } from "@bric/storefront-core/meta";

import { buildRateLimitHeaders, enforceRequestRateLimit } from "../../../../lib/request-security";
import { authorizeMetaSourceRequest, getMetaRequestContext } from "../../../../lib/meta-request";
import { getRequestId, withRequestIdHeaders } from "../../../../lib/sentry";

const MAX_META_BODY_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  if (!hasDb()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, {
      status: 503,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_META_BODY_BYTES) {
    return NextResponse.json({ error: "Meta event request is too large." }, {
      status: 413,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const rateLimit = await enforceRequestRateLimit(request, {
    scope: "storefront-meta-events",
    limit: 120,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ error: "Too many Meta event requests." }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const parsed = metaBrowserEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Meta event.", details: parsed.error.flatten() }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
  if (!authorizeMetaSourceRequest(request, parsed.data.eventSourceUrl)) {
    return NextResponse.json({ error: "Meta event source is not allowed." }, {
      status: 403,
      headers: withRequestIdHeaders(requestId),
    });
  }
  await enqueueMetaBrowserEvent(getDb(), parsed.data, getMetaRequestContext(request));
  return NextResponse.json({
    ok: true,
    queued: true,
    eventId: parsed.data.eventId,
  }, {
    status: 202,
    headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
  });
}
