import { NextRequest, NextResponse } from 'next/server';
import type { AdminSession } from '@/lib/auth';
import { getJobSnapshot } from '@bric/runtime/jobs';
import { parsePositiveIntegerIds } from '@bric/runtime/http-input';

import { hasDb } from '@bric/db/client';
import {
  ADMIN_ORDER_ECOTRACK_QUEUE,
  cancelExportJob,
  getLatestExportJob,
  startOrderEcotrackJob,
} from '@/lib/background-jobs';
import { requireMutationAccess } from '@/lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '@/lib/sentry';

function getRequesterKey(session: AdminSession | null) {
  return session?.user?.id ?? session?.user?.email ?? null;
}

function parseRequestBody(body: unknown): {
  mode: 'selected' | 'confirmed' | null;
  provider: 'delivro' | 'emir';
  orderIds: number[] | null;
} {
  let mode: 'selected' | 'confirmed' | null = null;
  let provider: 'delivro' | 'emir' = 'delivro';
  if (body && typeof body === 'object') {
    const rawMode = (body as Record<string, unknown>).mode;
    if (rawMode === 'confirmed' || rawMode === 'selected') {
      mode = rawMode;
    }
    const rawProvider = (body as Record<string, unknown>).provider;
    if (rawProvider === 'delivro' || rawProvider === 'emir') provider = rawProvider;
  }
  const rawOrderIds =
    body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).orderIds)
      ? ((body as Record<string, unknown>).orderIds as unknown[])
      : [];
  const orderIds = parsePositiveIntegerIds(rawOrderIds);

  return { mode, provider, orderIds };
}

export async function GET(request: Request) {
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

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId')?.trim() ?? '';
    if (jobId) {
      const job = await getJobSnapshot(ADMIN_ORDER_ECOTRACK_QUEUE, jobId);
      if (!job || job.ownerKey !== requesterKey) {
        return NextResponse.json(
          { error: 'Job not found.' },
          { status: 404, headers: withRequestIdHeaders(requestId) },
        );
      }

      return NextResponse.json({ job }, { headers: withRequestIdHeaders(requestId) });
    }

    return NextResponse.json(
      { job: await getLatestExportJob(ADMIN_ORDER_ECOTRACK_QUEUE, requesterKey) },
      { headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-ecotrack-status',
      route: '/api/orders/ecotrack',
      session,
    });
    throw error;
  }
}

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

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const { mode, provider, orderIds } = parseRequestBody(body);
    if (!mode || !orderIds) {
      return NextResponse.json(
        { error: 'mode and orderIds are required.' },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }

    const result = await startOrderEcotrackJob(
      requesterKey,
      {
        mode,
        ...(provider === 'emir' ? { provider } : {}),
        orderIds,
        actor: {
          email: session?.user?.email ?? null,
          name: session?.user?.name ?? null,
        },
      },
      requestId,
    );

    if (result.kind === 'busy') {
      return NextResponse.json(
        { error: 'Ecotrack posting is already running.', job: result.job },
        { status: 429, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(
      { job: result.job },
      { status: result.kind === 'started' ? 201 : 200, headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-ecotrack-start',
      route: '/api/orders/ecotrack',
      session,
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
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

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const job = await cancelExportJob(ADMIN_ORDER_ECOTRACK_QUEUE, requesterKey);
    if (!job) {
      return NextResponse.json(
        { error: 'No Ecotrack posting job is currently running.' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ job }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'order-ecotrack-cancel',
      route: '/api/orders/ecotrack',
      session,
    });
    throw error;
  }
}
