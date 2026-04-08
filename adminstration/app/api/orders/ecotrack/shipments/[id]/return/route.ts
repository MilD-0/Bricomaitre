import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../../../../db/client';
import { requestEcotrackReturn } from '../../../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../../../../lib/sentry';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { id } = await params;
    const item = await requestEcotrackReturn(Number(id), {
      email: session?.user?.email ?? null,
      name: session?.user?.name ?? null,
    });
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: withRequestIdHeaders(requestId) });
    }

    return NextResponse.json({ ok: true, item }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-return',
      route: '/api/orders/ecotrack/shipments/[id]/return',
      session,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request the ECOTRACK return.' }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
}
