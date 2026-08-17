import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { fetchSingleEcotrackLabel } from '../../../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireMutationAccess } from '../../../../../../../lib/rbac';
import {
  captureAdminException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../../../../lib/sentry';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const session = await auth();
  const { id } = await params;
  const orderId = parsePositiveIntegerId(id);
  if (!orderId) {
    return NextResponse.json(
      { error: 'Invalid order id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const label = await fetchSingleEcotrackLabel(orderId);
    if (!label) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return new NextResponse(label.body, {
      status: 200,
      headers: {
        'Content-Type': label.contentType ?? 'application/pdf',
        'Content-Disposition': label.contentDisposition ?? 'inline; filename="ecotrack-label.pdf"',
        ...withRequestIdHeaders(requestId),
      },
    });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-label',
      route: '/api/orders/ecotrack/shipments/[id]/label',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to fetch the ECOTRACK label.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
