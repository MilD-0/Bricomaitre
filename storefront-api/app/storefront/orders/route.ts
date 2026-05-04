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
import { captureStorefrontApiException, getRequestId, withRequestIdHeaders } from '../../../lib/sentry';

const SLOW_ORDER_CREATE_THRESHOLD_MS = 2_000;

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

  const payload = await req.json();
  const parsed = storefrontOrderCreateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  const orderVelocityLimit = await enforceOrderVelocityLimit(req, {
    journeyId: parsed.data.journeyId,
    visitId: parsed.data.visitId,
    sessionId: parsed.data.sessionId,
  });
  if (!orderVelocityLimit.ok) {
    return NextResponse.json({ error: 'Too many order attempts. Try again later.' }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(orderVelocityLimit)),
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
    });

    if (started.kind === 'existing' && started.record) {
      if (started.record.fingerprint !== fingerprint) {
        return NextResponse.json({ error: 'Idempotency key already used with a different payload.' }, { status: 409 });
      }

      if (started.record.status === 'completed') {
        return NextResponse.json(started.record.response.body, {
          status: started.record.response.statusCode,
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
        });
      }

      return NextResponse.json({ error: 'Order request is already being processed.' }, {
        status: 409,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      });
    }
  }

  try {
    const body = {
      ok: true,
      item: await createStorefrontOrder(getDb(), parsed.data, {
        reportTiming: (entry) => {
          timings.push(entry);
        },
      }),
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
