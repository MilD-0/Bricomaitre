import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb, hasDb } from "@bric/db/client";
import { enqueueMetaBrowserEvent } from "@bric/storefront-core/meta";

import { buildRateLimitHeaders, enforceRequestRateLimit } from "../../../lib/request-security";
import { authorizeMetaSourceRequest, getMetaRequestContext } from "../../../lib/meta-request";
import { getRequestId, withRequestIdHeaders } from "../../../lib/sentry";

const legacySchema = z.object({
  event_name: z.string().trim().min(1).max(80),
  event_time: z.number().int().positive().optional(),
  event_id: z.string().trim().min(1).max(120),
  url: z.string().url().max(2048),
  test_event_code: z.string().optional(),
  custom_data: z.object({
    contents: z.array(z.object({
      id: z.union([z.string(), z.number()]),
      quantity: z.coerce.number().int().positive().max(50).optional(),
    }).passthrough()).max(50).optional(),
  }).passthrough().optional(),
}).passthrough();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  if (!hasDb()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, {
      status: 503,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const rateLimit = await enforceRequestRateLimit(request, {
    scope: "storefront-meta-legacy",
    limit: 120,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ error: "Too many Meta event requests." }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
  }
  const parsed = legacySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid legacy Meta event." }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
  if (parsed.data.test_event_code) {
    return NextResponse.json({ error: "Public test event codes are not allowed." }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
  if (parsed.data.event_name === "Purchase") {
    return NextResponse.json({ error: "Browser Purchase events are no longer accepted." }, {
      status: 410,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const allowed = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout"] as const;
  if (!allowed.includes(parsed.data.event_name as typeof allowed[number])) {
    return NextResponse.json({ error: "Unsupported Meta event." }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
  if (!authorizeMetaSourceRequest(request, parsed.data.url)) {
    return NextResponse.json({ error: "Meta event source is not allowed." }, {
      status: 403,
      headers: withRequestIdHeaders(requestId),
    });
  }
  const items = (parsed.data.custom_data?.contents ?? []).flatMap((item) => {
    const value = String(item.id).trim();
    if (!/^\d+$/.test(value)) return [];
    const productId = Number.parseInt(value, 10);
    return Number.isInteger(productId) && productId > 0
      ? [{ productId, quantity: item.quantity ?? 1 }]
      : [];
  });
  await enqueueMetaBrowserEvent(getDb(), {
    eventId: parsed.data.event_id,
    eventName: parsed.data.event_name as typeof allowed[number],
    occurredAt: parsed.data.event_time
      ? new Date(parsed.data.event_time * 1000).toISOString()
      : undefined,
    eventSourceUrl: parsed.data.url,
    visitId: null,
    journeyId: null,
    sessionId: null,
    promoCode: null,
    items,
  }, getMetaRequestContext(request, parsed.data.url));
  return NextResponse.json({
    ok: true,
    queued: true,
    eventId: parsed.data.event_id,
  }, {
    status: 202,
    headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
  });
}
