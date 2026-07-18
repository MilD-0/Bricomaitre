import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { readStorefrontOrderByToken } from '@bric/storefront-core/orders';

import { buildRateLimitHeaders, enforceRequestRateLimit } from '../../../../../lib/request-security';
import { captureStorefrontApiException, getRequestId, withRequestIdHeaders } from '../../../../../lib/sentry';

const TOKEN_MIN_LENGTH = 20;
const TOKEN_MAX_LENGTH = 200;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const requestId = getRequestId(req);
  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const token = (await params).token.trim();
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: withRequestIdHeaders(requestId) });
  }

  const rateLimit = await enforceRequestRateLimit(req, {
    scope: 'storefront-order-track',
    limit: 60,
    windowSeconds: 60,
    suffix: token,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ error: 'Too many order lookup requests.' }, {
      status: 429,
      headers: withRequestIdHeaders(requestId, buildRateLimitHeaders(rateLimit)),
    });
  }

  try {
    const result = await readStorefrontOrderByToken(getDb(), token);
    if (result.kind !== 'ok') {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: withRequestIdHeaders(requestId) });
    }

    return NextResponse.json({ item: result.item }, {
      headers: withRequestIdHeaders(requestId, {
        ...buildRateLimitHeaders(rateLimit),
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      }),
    });
  } catch (error) {
    captureStorefrontApiException(error, {
      requestId,
      operation: 'storefront-order-track',
      route: '/storefront/orders/track/[token]',
      context: { tokenPresent: true },
    });
    throw error;
  }
}
