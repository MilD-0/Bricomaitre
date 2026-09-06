import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  fetchMergedEcotrackLabels,
  parseEcotrackBulkAction,
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
    const result = await fetchMergedEcotrackLabels(parsed.orderIds);

    return NextResponse.json(result, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-labels-bulk',
      route: '/api/orders/ecotrack/shipments/labels',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to merge ECOTRACK labels.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
