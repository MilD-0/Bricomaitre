import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontOrderToken } from '@bric/storefront-core/order-access';
import { readStorefrontOrder } from '@bric/storefront-core/orders';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { buildRateLimitHeaders, enforceRequestRateLimit } from '../../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../lib/sentry';

const PRIVATE_ORDER_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
};

function privateHeaders(requestId: string, extra: Record<string, string> = {}) {
  return withRequestIdHeaders(requestId, { ...PRIVATE_ORDER_HEADERS, ...extra });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: privateHeaders(requestId) },
    );
  }

  const token = readStorefrontOrderToken({
    headerToken: req.headers.get('x-order-token'),
    queryToken: req.nextUrl.searchParams.get('token'),
  });
  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-order-read',
    limit: 60,
    windowSeconds: 60,
    suffix: token ?? 'missing-token',
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

  const { id } = await params;
  const orderId = parsePositiveIntegerId(id);
  if (orderId === null) {
    return NextResponse.json(
      { error: 'Invalid order id.' },
      { status: 400, headers: privateHeaders(requestId, buildRateLimitHeaders(rateLimit)) },
    );
  }

  try {
    const result = await readStorefrontOrder(getDb(), orderId, token);

    if (result.kind === 'missing_token') {
      return NextResponse.json(
        { error: 'Order token is required' },
        { status: 401, headers: privateHeaders(requestId) },
      );
    }

    if (result.kind === 'not_found') {
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
      operation: 'storefront-order-read',
      route: '/storefront/orders/[id]',
      context: {
        orderId: id,
        tokenPresent: Boolean(token),
      },
    });
    throw error;
  }
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        'Customer order editing is not available. Please contact Bricomaitre to correct an order.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
