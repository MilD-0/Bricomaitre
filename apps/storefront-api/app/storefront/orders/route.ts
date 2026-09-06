import { after, NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { UnorderableCartError } from '@bric/storefront-core/order-commercial';
import {
  buildIdempotencyFingerprint,
  buildIdempotencyKeyHash,
  claimStorefrontOrderIdempotency,
  clearStorefrontOrderIdempotency,
  StorefrontOrderClaimLostError,
} from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder, readCommittedStorefrontOrder } from '@bric/storefront-core/orders';

import { authorizeMetaSourceRequest, getMetaRequestContext } from '../../../lib/meta-request';
import {
  buildRateLimitHeaders,
  enforceOrderVelocityLimit,
  enforceRequestRateLimit,
} from '../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../lib/sentry';

const SLOW_ORDER_CREATE_THRESHOLD_MS = 2_000;
const ORDER_CREATE_PROCESSING_TTL_SECONDS = 120;
const MAX_ORDER_BODY_BYTES = 32_768;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

type OrderTimingEntry = {
  step: string;
  durationMs: number;
};

function orderServiceUnavailable(requestId: string) {
  return NextResponse.json(
    { error: 'Order service is temporarily unavailable. Please try again.' },
    { status: 503, headers: withRequestIdHeaders(requestId) },
  );
}

function logOrderTiming(options: {
  requestId: string;
  totalDurationMs: number;
  timings: OrderTimingEntry[];
  payload: {
    cartSize: number;
    hasJourneyId: boolean;
    hasSessionId: boolean;
    delivery: number;
    state: number | null;
  };
  outcome: 'slow' | 'failed';
  errorMessage?: string;
}) {
  console[options.outcome === 'failed' ? 'error' : 'warn']('[storefront-api] order create timing', {
    requestId: options.requestId,
    totalDurationMs: options.totalDurationMs,
    timings: options.timings,
    payload: options.payload,
    outcome: options.outcome,
    errorMessage: options.errorMessage,
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const idempotencyKey = req.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return NextResponse.json(
      { error: 'idempotency_key_required' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  let rateLimit;
  try {
    rateLimit = await enforceRequestRateLimit(req, {
      scope: 'storefront-order-create',
      limit: 20,
      windowSeconds: 60,
    });
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-rate-limit',
      route: '/storefront/orders',
    });
    return orderServiceUnavailable(requestId);
  }
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many order requests.' },
      {
        status: 429,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  }

  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_ORDER_BODY_BYTES) {
    return NextResponse.json(
      { error: 'order_payload_too_large' },
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

  const parsed = storefrontOrderCreateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid order request.',
        details: parsed.error.flatten(),
      },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }
  const marketingSourceUrls = [
    parsed.data.marketing?.eventSourceUrl,
    parsed.data.meta?.eventSourceUrl,
  ].filter((value): value is string => Boolean(value));
  if (marketingSourceUrls.some((sourceUrl) => !authorizeMetaSourceRequest(req, sourceUrl))) {
    return NextResponse.json(
      { error: 'Order marketing source is not allowed.' },
      {
        status: 403,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }

  const fingerprint = buildIdempotencyFingerprint(parsed.data);
  const keyHash = buildIdempotencyKeyHash(idempotencyKey);
  let claim;
  try {
    claim = await claimStorefrontOrderIdempotency(getDb(), {
      keyHash,
      fingerprint,
      processingTtlSeconds: ORDER_CREATE_PROCESSING_TTL_SECONDS,
    });
    if (claim.kind === 'conflict') {
      return NextResponse.json(
        { error: 'Idempotency key already used with a different payload.' },
        {
          status: 409,
          headers: withRequestIdHeaders(requestId),
        },
      );
    }
    if (claim.kind === 'processing') {
      return NextResponse.json(
        { error: 'Order request is already being processed.', code: 'processing' },
        {
          status: 409,
          headers: withRequestIdHeaders(requestId, {
            'retry-after': String(claim.retryAfterSeconds),
          }),
        },
      );
    }
    if (claim.kind === 'completed') {
      const item = await readCommittedStorefrontOrder(getDb(), claim.orderId);
      if (!item) throw new Error('Durable idempotency record references a missing order.');
      return NextResponse.json(
        { ok: true, item, ...(claim.metaResponse ? { meta: claim.metaResponse } : {}) },
        {
          status: 201,
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
        },
      );
    }
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-idempotency',
      route: '/storefront/orders',
    });
    return orderServiceUnavailable(requestId);
  }

  const idempotency = { keyHash, fingerprint, createdAt: claim.createdAt };
  const timings: OrderTimingEntry[] = [];
  const startedAt = performance.now();
  async function clearClaim() {
    try {
      await clearStorefrontOrderIdempotency(getDb(), idempotency);
    } catch (error) {
      captureStorefrontApiException(error, {
        requestId,
        operation: 'storefront-order-idempotency-clear',
        route: '/storefront/orders',
      });
    }
  }

  try {
    let velocity;
    try {
      velocity = await enforceOrderVelocityLimit(req, {
        journeyId: parsed.data.journeyId,
        visitId: parsed.data.visitId,
        sessionId: parsed.data.sessionId,
      });
    } catch (error) {
      await clearClaim();
      captureStorefrontApiException(error, {
        requestId,
        operation: 'storefront-order-velocity-limit',
        route: '/storefront/orders',
      });
      return orderServiceUnavailable(requestId);
    }
    if (!velocity.ok) {
      await clearClaim();
      return NextResponse.json(
        { error: 'Too many order attempts. Please try again later.' },
        {
          status: 429,
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(velocity)),
        },
      );
    }
    const { item, meta } = await createStorefrontOrder(getDb(), parsed.data, {
      reportTiming: (entry) => timings.push(entry),
      metaRequestContext: getMetaRequestContext(req, marketingSourceUrls[0]),
      idempotency,
      scheduleAfterCommit: after,
      reportEnrichmentError: (error) =>
        captureStorefrontApiException(error, {
          requestId,
          operation: 'storefront-order-enrichment',
          route: '/storefront/orders',
        }),
    });
    const totalDurationMs = Number((performance.now() - startedAt).toFixed(1));
    if (totalDurationMs >= SLOW_ORDER_CREATE_THRESHOLD_MS) {
      logOrderTiming({
        requestId,
        totalDurationMs,
        timings,
        outcome: 'slow',
        payload: {
          cartSize: parsed.data.cartProducts.length,
          hasJourneyId: Boolean(parsed.data.journeyId),
          hasSessionId: Boolean(parsed.data.sessionId),
          delivery: parsed.data.delivery,
          state: parsed.data.state,
        },
      });
    }
    return NextResponse.json(
      { ok: true, item, ...(meta ? { meta } : {}) },
      {
        status: 201,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  } catch (error) {
    await clearClaim();
    if (error instanceof StorefrontOrderClaimLostError) {
      return NextResponse.json(
        { error: 'Order request is already being processed.', code: 'processing' },
        {
          status: 409,
          headers: withRequestIdHeaders(requestId, { 'retry-after': '1' }),
        },
      );
    }
    if (error instanceof UnorderableCartError) {
      return NextResponse.json(
        {
          error:
            'Your cart changed. Review current prices, promotions and availability before ordering.',
          code: 'cart_changed',
        },
        {
          status: 409,
          headers: withRequestIdHeaders(requestId),
        },
      );
    }
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-create',
      route: '/storefront/orders',
    });
    logOrderTiming({
      requestId,
      totalDurationMs: Number((performance.now() - startedAt).toFixed(1)),
      timings,
      outcome: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      payload: {
        cartSize: parsed.data.cartProducts.length,
        hasJourneyId: Boolean(parsed.data.journeyId),
        hasSessionId: Boolean(parsed.data.sessionId),
        delivery: parsed.data.delivery,
        state: parsed.data.state,
      },
    });
    return orderServiceUnavailable(requestId);
  }
}
