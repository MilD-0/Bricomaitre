import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  dispatchEcotrackOrdersBatch,
  parseEcotrackBulkDispatchRequest,
} from '../../../../../../lib/admin-ecotrack-orders-data';
import { requireMutationAccess } from '../../../../../../lib/rbac';
import {
  captureAdminException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../../../lib/sentry';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const body = await request.json().catch(() => null);
  let parsed: ReturnType<typeof parseEcotrackBulkDispatchRequest>;
  try {
    parsed = parseEcotrackBulkDispatchRequest(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request body.' },
      {
        status: 400,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }

  try {
    const result = await dispatchEcotrackOrdersBatch(
      parsed.orderIds,
      {
        askCollection: parsed.askCollection,
      },
      {
        email: session?.user?.email ?? null,
        name: session?.user?.name ?? null,
      },
    );

    return NextResponse.json(result, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-dispatch-bulk',
      route: '/api/orders/ecotrack/shipments/dispatch',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to dispatch ECOTRACK shipments.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
