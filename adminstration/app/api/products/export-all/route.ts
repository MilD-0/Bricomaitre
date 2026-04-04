import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';

import { auth } from '../../../../lib/auth';
import {
  ADMIN_PRODUCT_EXPORT_QUEUE,
  cancelExportJob,
  getLatestExportJob,
  startProductExportJob,
} from '../../../../lib/background-jobs';
import { canExportAllProducts } from '../../../../lib/permissions';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

function getRequesterKey(session: Session | null) {
  return session?.user?.id ?? session?.user?.email ?? null;
}

async function requireExportAccess() {
  const session = await auth();

  if (!session?.user) {
    return { session, denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!canExportAllProducts(session.user.role)) {
    return { session, denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, denied: null };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: withRequestIdHeaders(requestId) });
  }

  try {
    return NextResponse.json(
      { job: await getLatestExportJob(ADMIN_PRODUCT_EXPORT_QUEUE, requesterKey) },
      { headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-export-status',
      route: '/api/products/export-all',
      session,
    });
    throw error;
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: withRequestIdHeaders(requestId) });
  }

  try {
    const startResult = await startProductExportJob(requesterKey, requestId);

    if (startResult.kind === 'busy') {
      return NextResponse.json(
        { error: 'Another product export is already running.', job: startResult.job },
        { status: 429, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json(
      { job: startResult.job },
      { status: startResult.kind === 'started' ? 201 : 200, headers: withRequestIdHeaders(requestId) },
    );
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-export-start',
      route: '/api/products/export-all',
      session,
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const requestId = getRequestId(request);
  const { session, denied } = await requireExportAccess();
  if (denied) {
    return denied;
  }

  const requesterKey = getRequesterKey(session);
  if (!requesterKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: withRequestIdHeaders(requestId) });
  }

  try {
    const job = await cancelExportJob(ADMIN_PRODUCT_EXPORT_QUEUE, requesterKey);

    if (!job) {
      return NextResponse.json({ error: 'No export job is currently running.' }, { status: 404, headers: withRequestIdHeaders(requestId) });
    }

    return NextResponse.json({ job }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'product-export-cancel',
      route: '/api/products/export-all',
      session,
    });
    throw error;
  }
}
