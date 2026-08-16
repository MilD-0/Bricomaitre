import { NextRequest, NextResponse } from 'next/server';
import type { AdminSession } from '../../../../lib/auth';

import { auth } from '../../../../lib/auth';
import {
  ADMIN_ORDER_EXPORT_QUEUE,
  cancelExportJob,
  getLatestExportJob,
  startOrderExportJob,
} from '../../../../lib/background-jobs';
import { canMutateResource } from '../../../../lib/rbac';
import { normalizePermissions } from '../../../../lib/permissions';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

function getRequesterKey(session: AdminSession | null) {
  return session?.user?.id ?? session?.user?.email ?? null;
}

async function requireOrderExportAccess() {
  const session = await auth();

  if (!session?.user) {
    return { session, denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!session.user.isAllowed) {
    return { session, denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (!canMutateResource(normalizePermissions(session.user.permissions), 'orders')) {
    return { session, denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, denied: null };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireOrderExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    return NextResponse.json(
      { job: await getLatestExportJob(ADMIN_ORDER_EXPORT_QUEUE, requesterKey) },
      { headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-export-status',
      route: '/api/orders/export',
      session,
    });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireOrderExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const mode =
      body?.mode === 'confirmed' ? 'confirmed' : body?.mode === 'selected' ? 'selected' : null;
    const rawOrderIds: unknown[] = Array.isArray(body?.orderIds) ? body.orderIds : [];
    const orderIds: number[] = [
      ...new Set(
        rawOrderIds
          .map((value: unknown) => Number(value))
          .filter((value): value is number => Number.isInteger(value) && value > 0),
      ),
    ];

    if (!mode || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'mode and orderIds are required.' },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }

    const startResult = await startOrderExportJob(requesterKey, { mode, orderIds }, requestId);

    if (startResult.kind === 'busy') {
      return NextResponse.json(
        { error: 'Another order export is already running.', job: startResult.job },
        { status: 429, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(
      { job: startResult.job },
      {
        status: startResult.kind === 'started' ? 201 : 200,
        headers: withRequestIdHeaders(requestId),
      },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-export-start',
      route: '/api/orders/export',
      session,
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireOrderExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const job = await cancelExportJob(ADMIN_ORDER_EXPORT_QUEUE, requesterKey);
    if (!job) {
      return NextResponse.json(
        { error: 'No order export is currently running.' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ job }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-export-cancel',
      route: '/api/orders/export',
      session,
    });
    throw error;
  }
}
