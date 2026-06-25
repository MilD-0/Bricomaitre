import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import {
  beginIdempotentRequest,
  buildIdempotencyFingerprint,
  clearIdempotentRequest,
  completeIdempotentRequest,
} from '@bric/runtime/idempotency';
import { getDb, hasDb } from '@bric/db/client';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { createStorefrontOrder } from '@bric/storefront-core/orders';

import { buildRateLimitHeaders, enforceOrderVelocityLimit, enforceRequestRateLimit } from '../../../lib/request-security';
import { authorizeMetaSourceRequest, getMetaRequestContext } from '../../../lib/meta-request';
import { captureStorefrontApiException, getRequestId, withRequestIdHeaders } from '../../../lib/sentry';

const SLOW_ORDER_CREATE_THRESHOLD_MS = 2_000;
const ORDER_CREATE_PROCESSING_TTL_SECONDS = 120;

type OrderTimingEntry = {
  step: string;
  durationMs: number;
};

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
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503, headers: withRequestIdHeaders(requestId) });
  }

  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-order-create',
    limit: 20,
    windowSeconds: 60,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ error: 'Too many order requests.' }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
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
  if (parsed.data.meta && !authorizeMetaSourceRequest(req, parsed.data.meta.eventSourceUrl)) {
    return NextResponse.json({ error: 'Order Meta source is not allowed.' }, {
      status: 403,
      headers: withRequestIdHeaders(requestId),
    });
  }

  const idempotencyKey = req.headers.get('idempotency-key')?.trim();
  const fingerprint = buildIdempotencyFingerprint(parsed.data);
  const timings: OrderTimingEntry[] = [];
  const startedAt = performance.now();

  if (idempotencyKey) {
    const started = await beginIdempotentRequest({
      scope: 'storefront-order-create',
      key: idempotencyKey,
      fingerprint,
      ttlSeconds: ORDER_CREATE_PROCESSING_TTL_SECONDS,
    });

    if (started.kind === 'existing' && started.record) {
      if (started.record.fingerprint !== fingerprint) {
        return NextResponse.json({ error: 'Idempotency key already used with a different payload.' }, {
          status: 409,
          headers: withRequestIdHeaders(requestId),
        });
      }

      if (started.record.status === 'completed') {
        return NextResponse.json(started.record.response.body, {
          status: started.record.response.statusCode,
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
        });
      }

      const retryAfterSeconds = started.ttlSeconds ?? ORDER_CREATE_PROCESSING_TTL_SECONDS;
      return NextResponse.json({ error: 'Order request is already being processed.' }, {
        status: 409,
        headers: withRequestIdHeaders(requestId, {
          ...buildRateLimitHeaders(rateLimit),
          'retry-after': String(retryAfterSeconds),
        }),
      });
    }
  }

  const orderVelocityLimit = await enforceOrderVelocityLimit(req, {
    journeyId: parsed.data.journeyId,
    visitId: parsed.data.visitId,
    sessionId: parsed.data.sessionId,
  });
  if (!orderVelocityLimit.ok) {
    if (idempotencyKey) {
      await clearIdempotentRequest('storefront-order-create', idempotencyKey);
    }

    const retryAfterMinutes = Math.max(1, Math.ceil(orderVelocityLimit.retryAfterSeconds / 60));
    return NextResponse.json({ error: `Too many order attempts. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.` }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(orderVelocityLimit)),
    });
  }

  try {
    const created = await createStorefrontOrder(getDb(), parsed.data, {
        reportTiming: (entry) => {
          timings.push(entry);
        },
        metaRequestContext: getMetaRequestContext(req),
      });
    const createdResult = created as typeof created | (typeof created)['item'];
    const item = createdResult && typeof createdResult === 'object' && 'item' in createdResult
      ? createdResult.item
      : createdResult;
    const meta = createdResult && typeof createdResult === 'object' && 'meta' in createdResult
      ? createdResult.meta
      : undefined;
    const body = {
      ok: true,
      item,
      ...(meta ? { meta } : {}),
    };
    const totalDurationMs = Number((performance.now() - startedAt).toFixed(1));

    if (totalDurationMs >= SLOW_ORDER_CREATE_THRESHOLD_MS) {
      logOrderTiming({
        requestId,
        totalDurationMs,
        timings,
        payload: {
          cartSize: parsed.data.cartProducts.length,
          hasJourneyId: Boolean(parsed.data.journeyId),
          hasSessionId: Boolean(parsed.data.sessionId),
          delivery: parsed.data.delivery,
          state: parsed.data.state,
        },
        outcome: 'slow',
      });
    }

    if (idempotencyKey) {
      await completeIdempotentRequest({
        scope: 'storefront-order-create',
        key: idempotencyKey,
        fingerprint,
        statusCode: 200,
        body,
      });
    }

    return NextResponse.json(body, {
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-create',
      route: '/storefront/orders',
      context: {
        hasIdempotencyKey: Boolean(idempotencyKey),
        idempotencyKeyPresent: Boolean(idempotencyKey),
      },
    });

    if (idempotencyKey) {
      await clearIdempotentRequest('storefront-order-create', idempotencyKey);
    }

    logOrderTiming({
      requestId,
      totalDurationMs: Number((performance.now() - startedAt).toFixed(1)),
      timings,
      payload: {
        cartSize: parsed.data.cartProducts.length,
        hasJourneyId: Boolean(parsed.data.journeyId),
        hasSessionId: Boolean(parsed.data.sessionId),
        delivery: parsed.data.delivery,
        state: parsed.data.state,
      },
      outcome: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
