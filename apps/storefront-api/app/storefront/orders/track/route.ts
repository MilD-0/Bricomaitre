import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontOrderByToken } from '@bric/storefront-core/orders';

import { buildRateLimitHeaders, enforceRequestRateLimit } from '../../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../lib/sentry';

const TOKEN_MIN_LENGTH = 20;
const TOKEN_MAX_LENGTH = 200;
const PRIVATE_ORDER_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
};

function privateHeaders(requestId: string, extra: Record<string, string> = {}) {
  return withRequestIdHeaders(requestId, { ...PRIVATE_ORDER_HEADERS, ...extra });
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: privateHeaders(requestId) },
    );
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    return NextResponse.json(
      { error: 'Invalid order lookup.' },
      { status: 400, headers: privateHeaders(requestId) },
    );
  }

  const rateLimit = await enforceRequestRateLimit(request, {
    scope: 'storefront-order-track',
    limit: 60,
    windowSeconds: 60,
    suffix: token,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many order lookup requests.' },
      {
        status: 429,
        headers: privateHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  }

  try {
    const result = await readStorefrontOrderByToken(getDb(), token);
    if (result.kind !== 'ok') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: privateHeaders(requestId) },
      );
    }

    return NextResponse.json(
      { item: result.item },
      {
        headers: privateHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-track',
      route: '/storefront/orders/track',
      context: { tokenPresent: true },
    });
    throw error;
  }
}
