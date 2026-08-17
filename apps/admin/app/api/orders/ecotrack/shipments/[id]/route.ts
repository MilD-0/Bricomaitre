import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  deletePostedEcotrackOrder,
  loadEcotrackOrderDetail,
  parseEcotrackShipmentUpdateDraft,
  updatePostedEcotrackOrder,
} from '../../../../../../lib/admin-ecotrack-orders-data';
import { auth } from '../../../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { requireMutationAccess } from '../../../../../../lib/rbac';
import {
  captureAdminException,
  getRequestId,
  withRequestIdHeaders,
} from '../../../../../../lib/sentry';

async function readOrderId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return parsePositiveIntegerId(id);
}

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
  const orderId = await readOrderId(params);
  if (!orderId) {
    return NextResponse.json(
      { error: 'Invalid order id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const item = await loadEcotrackOrderDetail(orderId, {
      email: null,
      name: 'ECOTRACK sync',
    });
    if (!item) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ item }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-detail',
      route: '/api/orders/ecotrack/shipments/[id]',
      session,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load ECOTRACK shipment detail.',
      },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const orderId = await readOrderId(params);
  if (!orderId) {
    return NextResponse.json(
      { error: 'Invalid order id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const body = await request.json().catch(() => null);
  let parsed: ReturnType<typeof parseEcotrackShipmentUpdateDraft>;
  try {
    parsed = parseEcotrackShipmentUpdateDraft(body);
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
    const item = await updatePostedEcotrackOrder(orderId, parsed, {
      email: session?.user?.email ?? null,
      name: session?.user?.name ?? null,
    });
    if (!item) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ ok: true, item }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-update',
      route: '/api/orders/ecotrack/shipments/[id]',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update ECOTRACK shipment.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const orderId = await readOrderId(params);
  if (!orderId) {
    return NextResponse.json(
      { error: 'Invalid order id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const result = await deletePostedEcotrackOrder(orderId, {
      email: session?.user?.email ?? null,
      name: session?.user?.name ?? null,
    });
    if (!result) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(result, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'ecotrack-shipment-delete',
      route: '/api/orders/ecotrack/shipments/[id]',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete ECOTRACK shipment.' },
      {
        status: 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
