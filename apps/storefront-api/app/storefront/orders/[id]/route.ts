import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontOrderPatchRequestSchema } from '@bric/storefront-core/contracts';
import { readStorefrontOrderToken } from '@bric/storefront-core/order-access';
import { readStorefrontOrder, updateStorefrontOrder } from '@bric/storefront-core/orders';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';

import { buildRateLimitHeaders, enforceRequestRateLimit } from '../../../../lib/request-security';
import {
  captureStorefrontApiException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../lib/sentry';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
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
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  }

  const { id } = await params;
  const orderId = parsePositiveIntegerId(id);
  if (orderId === null) {
    return NextResponse.json(
      { error: 'Invalid order id.' },
      { status: 400, headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)) },
    );
  }

  try {
    const result = await readStorefrontOrder(getDb(), orderId, token);

    if (result.kind === 'missing_token') {
      return NextResponse.json(
        { error: 'Order token is required' },
        { status: 401, headers: withRequestIdHeaders(requestId) },
      );
    }

    if (result.kind === 'not_found') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(
      { item: result.item },
      {
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const token = readStorefrontOrderToken({
    headerToken: req.headers.get('x-order-token'),
    queryToken: req.nextUrl.searchParams.get('token'),
  });
  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-order-update',
    limit: 30,
    windowSeconds: 60,
    suffix: token ?? 'missing-token',
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many order update requests.' },
      {
        status: 429,
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  }

  const { id } = await params;
  const orderId = parsePositiveIntegerId(id);
  if (orderId === null) {
    return NextResponse.json(
      { error: 'Invalid order id.' },
      { status: 400, headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)) },
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

  const parsed = storefrontOrderPatchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const result = await updateStorefrontOrder(getDb(), orderId, token, parsed.data);

    if (result.kind === 'missing_token') {
      return NextResponse.json(
        { error: 'Order token is required' },
        { status: 401, headers: withRequestIdHeaders(requestId) },
      );
    }

    if (result.kind === 'not_found') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item: result.item,
      },
      {
        headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
      },
    );
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-update',
      route: '/storefront/orders/[id]',
      context: {
        orderId: id,
        tokenPresent: Boolean(token),
      },
    });
    throw error;
  }
}
