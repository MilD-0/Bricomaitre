import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../../../../db/client';
import { parseEcotrackShipmentUpdateDraft, recreatePostedEcotrackOrder } from '../../../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../../../lib/auth';
import { requireMutationAccess } from '../../../../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../../../../lib/sentry';

async function readOrderId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return Number(id);
}

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
    const body = await request.json().catch(() => null);
    const parsed = parseEcotrackShipmentUpdateDraft(body);
    const item = await recreatePostedEcotrackOrder(await readOrderId(params), parsed, {
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
      operation: 'ecotrack-shipment-recreate',
      route: '/api/orders/ecotrack/shipments/[id]/recreate',
      session,
    });

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to recreate ECOTRACK shipment.' }, {
      status: 400,
      headers: withRequestIdHeaders(requestId),
    });
  }
}
