import { NextRequest, NextResponse } from 'next/server';

import {
  beginIdempotentRequest,
  buildIdempotencyFingerprint,
  buildIdempotencyKeyHash,
  clearIdempotentRequest,
  completeIdempotentRequest,
} from '@bric/runtime/idempotency';
import { getDb, hasDb } from '@bric/db/client';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { UnorderableCartError } from '@bric/storefront-core/order-commercial';
import {
  claimStorefrontOrderIdempotency,
  clearStorefrontOrderIdempotency,
} from '@bric/storefront-core/order-idempotency';
import { createStorefrontOrder, readCommittedStorefrontOrder } from '@bric/storefront-core/orders';

import {
  buildRateLimitHeaders,
  enforceOrderVelocityLimit,
  enforceRequestRateLimit,
} from '../../../lib/request-security';
import { authorizeMetaSourceRequest, getMetaRequestContext } from '../../../lib/meta-request';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../lib/sentry';

const SLOW_ORDER_CREATE_THRESHOLD_MS = 2_000;
const ORDER_CREATE_PROCESSING_TTL_SECONDS = 120;

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

async function clearOrderIdempotencyBestEffort(
  idempotencyKey: string,
  requestId: string,
  operation: string,
) {
  try {
    await clearIdempotentRequest('storefront-order-create', idempotencyKey);
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation,
      route: '/storefront/orders',
      context: { idempotencyKeyPresent: true },
    });
  }
}

async function clearDurableOrderIdempotencyBestEffort(
  db: ReturnType<typeof getDb>,
  keyHash: string,
  fingerprint: string,
  requestId: string,
  operation: string,
) {
  try {
    await clearStorefrontOrderIdempotency(db, { keyHash, fingerprint });
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation,
      route: '/storefront/orders',
      context: { durableIdempotency: true },
    });
  }
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

  const idempotencyKey = req.headers.get('idempotency-key')?.trim();
  const fingerprint = buildIdempotencyFingerprint(parsed.data);
  const idempotencyKeyHash = idempotencyKey ? buildIdempotencyKeyHash(idempotencyKey) : null;
  let durableIdempotencyStarted = false;
  const timings: OrderTimingEntry[] = [];
  const startedAt = performance.now();

  if (idempotencyKey) {
    let started;
    try {
      started = await beginIdempotentRequest({
        scope: 'storefront-order-create',
        key: idempotencyKey,
        fingerprint,
        ttlSeconds: ORDER_CREATE_PROCESSING_TTL_SECONDS,
      });
    } catch (error) {
      captureStorefrontApiException(error, {
        requestId,
        operation: 'storefront-order-idempotency-start',
        route: '/storefront/orders',
        context: { idempotencyKeyPresent: true },
      });
      return orderServiceUnavailable(requestId);
    }

    if (started.kind === 'existing' && started.record) {
      if (started.record.fingerprint !== fingerprint) {
        return NextResponse.json(
          { error: 'Idempotency key already used with a different payload.' },
          {
            status: 409,
            headers: withRequestIdHeaders(requestId),
          },
        );
      }

      if (started.record.status === 'completed') {
        return NextResponse.json(started.record.response.body, {
          status: started.record.response.statusCode,
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
        });
      }
    }

    try {
      const durableClaim = await claimStorefrontOrderIdempotency(getDb(), {
        keyHash: idempotencyKeyHash!,
        fingerprint,
        processingTtlSeconds: ORDER_CREATE_PROCESSING_TTL_SECONDS,
      });

      if (durableClaim.kind === 'conflict') {
        return NextResponse.json(
          { error: 'Idempotency key already used with a different payload.' },
          {
            status: 409,
            headers: withRequestIdHeaders(requestId),
          },
        );
      }

      if (durableClaim.kind === 'completed') {
        const item = await readCommittedStorefrontOrder(getDb(), durableClaim.orderId);
        if (!item) {
          throw new Error('Durable idempotency record references a missing order.');
        }
        const body = {
          ok: true,
          item,
          ...(durableClaim.metaResponse ? { meta: durableClaim.metaResponse } : {}),
        };
        return NextResponse.json(body, {
          headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
        });
      }

      const redisProcessing =
        started.kind === 'existing' && started.record?.status === 'processing';
      if (durableClaim.kind === 'processing' || redisProcessing) {
        if (durableClaim.kind === 'started') {
          await clearDurableOrderIdempotencyBestEffort(
            getDb(),
            idempotencyKeyHash!,
            fingerprint,
            requestId,
            'storefront-order-durable-idempotency-clear-after-redis-processing',
          );
        }
        const retryAfterSeconds =
          durableClaim.kind === 'processing'
            ? durableClaim.retryAfterSeconds
            : (started.ttlSeconds ?? ORDER_CREATE_PROCESSING_TTL_SECONDS);
        return NextResponse.json(
          { error: 'Order request is already being processed.' },
          {
            status: 409,
            headers: withRequestIdHeaders(requestId, {
              ...buildRateLimitHeaders(rateLimit),
              'retry-after': String(retryAfterSeconds),
            }),
          },
        );
      }

      durableIdempotencyStarted = true;
    } catch (error) {
      captureStorefrontApiException(error, {
        requestId,
        operation: 'storefront-order-durable-idempotency-claim',
        route: '/storefront/orders',
        context: { idempotencyKeyPresent: true },
      });
      await clearOrderIdempotencyBestEffort(
        idempotencyKey,
        requestId,
        'storefront-order-idempotency-clear-after-durable-error',
      );
      return orderServiceUnavailable(requestId);
    }
  }

  let orderVelocityLimit;
  try {
    orderVelocityLimit = await enforceOrderVelocityLimit(req, {
      journeyId: parsed.data.journeyId,
      visitId: parsed.data.visitId,
      sessionId: parsed.data.sessionId,
    });
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-velocity-limit',
      route: '/storefront/orders',
    });
    if (idempotencyKey) {
      await clearOrderIdempotencyBestEffort(
        idempotencyKey,
        requestId,
        'storefront-order-idempotency-clear-after-velocity-error',
      );
      if (durableIdempotencyStarted) {
        await clearDurableOrderIdempotencyBestEffort(
          getDb(),
          idempotencyKeyHash!,
          fingerprint,
          requestId,
          'storefront-order-durable-idempotency-clear-after-velocity-error',
        );
      }
    }
    return orderServiceUnavailable(requestId);
  }
  if (!orderVelocityLimit.ok) {
    if (idempotencyKey) {
      await clearOrderIdempotencyBestEffort(
        idempotencyKey,
        requestId,
        'storefront-order-idempotency-clear-after-rate-limit',
      );
      if (durableIdempotencyStarted) {
        await clearDurableOrderIdempotencyBestEffort(
          getDb(),
          idempotencyKeyHash!,
          fingerprint,
          requestId,
          'storefront-order-durable-idempotency-clear-after-rate-limit',
        );
      }
    }

    const retryAfterMinutes = Math.max(1, Math.ceil(orderVelocityLimit.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        error: `Too many order attempts. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
      },
      {
        status: 429,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(orderVelocityLimit)),
      },
    );
  }

  try {
    const created = await createStorefrontOrder(getDb(), parsed.data, {
      reportTiming: (entry) => {
        timings.push(entry);
      },
      metaRequestContext: getMetaRequestContext(req, marketingSourceUrls[0]),
      ...(durableIdempotencyStarted
        ? {
            idempotency: {
              keyHash: idempotencyKeyHash!,
              fingerprint,
            },
          }
        : {}),
    });
    const createdResult = created as typeof created | (typeof created)['item'];
    const item =
      createdResult && typeof createdResult === 'object' && 'item' in createdResult
        ? createdResult.item
        : createdResult;
    const meta =
      createdResult && typeof createdResult === 'object' && 'meta' in createdResult
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
      try {
        await completeIdempotentRequest({
          scope: 'storefront-order-create',
          key: idempotencyKey,
          fingerprint,
          statusCode: 200,
          body,
        });
      } catch (error) {
        captureStorefrontApiException(error, {
          requestId,
          operation: 'storefront-order-idempotency-complete',
          route: '/storefront/orders',
          context: {
            idempotencyKeyPresent: true,
            orderCommitted: true,
          },
        });
      }
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
      await clearOrderIdempotencyBestEffort(
        idempotencyKey,
        requestId,
        'storefront-order-idempotency-clear-after-create-error',
      );
      if (durableIdempotencyStarted) {
        await clearDurableOrderIdempotencyBestEffort(
          getDb(),
          idempotencyKeyHash!,
          fingerprint,
          requestId,
          'storefront-order-durable-idempotency-clear-after-create-error',
        );
      }
    }

    if (error instanceof UnorderableCartError) {
      return NextResponse.json(
        {
          error: 'Your cart changed. Review current product availability before ordering.',
          code: 'cart_changed',
        },
        { status: 409, headers: withRequestIdHeaders(requestId) },
      );
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
