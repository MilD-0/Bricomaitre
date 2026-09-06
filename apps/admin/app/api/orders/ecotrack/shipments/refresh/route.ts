import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  parseEcotrackBulkAction,
  refreshEcotrackOrdersBatch,
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
  let parsed: ReturnType<typeof parseEcotrackBulkAction>;
  try {
    parsed = parseEcotrackBulkAction(body);
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
    const result = await refreshEcotrackOrdersBatch(parsed.orderIds, {
      email: session?.user?.email ?? null,
      name: session?.user?.name ?? null,
    });
    return NextResponse.json(result, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipments-refresh-batch',
      route: '/api/orders/ecotrack/shipments/refresh',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to refresh ECOTRACK shipments.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
