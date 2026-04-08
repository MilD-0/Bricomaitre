import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../../../db/client';
import { fetchMergedEcotrackLabels, parseEcotrackBulkAction } from '../../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../../../lib/sentry';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503, headers: withRequestIdHeaders(requestId) });
  }

  const session = await auth();

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseEcotrackBulkAction(body);
    const label = await fetchMergedEcotrackLabels(parsed.orderIds);

    return new NextResponse(Buffer.from(label.body), {
      status: 200,
      headers: {
        'Content-Type': label.contentType,
        'Content-Disposition': `attachment; filename="${label.fileName}"`,
        ...withRequestIdHeaders(requestId),
      },
    });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-labels-bulk',
      route: '/api/orders/ecotrack/shipments/labels',
      session,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to merge ECOTRACK labels.' }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
}
