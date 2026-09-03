import { NextRequest, NextResponse } from 'next/server';
import type { AdminSession } from '../../../../../lib/auth';

import { auth } from '../../../../../lib/auth';
import { ADMIN_ORDER_EXPORT_QUEUE, getLatestExportJob } from '../../../../../lib/background-jobs';
import { canMutateResource } from '../../../../../lib/rbac';
import { normalizePermissions } from '../../../../../lib/permissions';
import {
  deletePrivateS3Object,
  isS3ObjectNotFound,
  readPrivateS3Object,
} from '../../../../../lib/s3-upload';

function getRequesterKey(session: AdminSession | null) {
  return session?.user?.id ?? session?.user?.email ?? null;
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    !session.user.isAllowed ||
    !canMutateResource(normalizePermissions(session.user.permissions), 'orders')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requesterKey = getRequesterKey(session);
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!requesterKey || !jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const job = await getLatestExportJob(ADMIN_ORDER_EXPORT_QUEUE, requesterKey);
  const artifactKey = job?.resultSummary?.artifactKey;
  const artifactExpiresAt = job?.resultSummary?.artifactExpiresAt;
  if (
    !job ||
    job.id !== jobId ||
    typeof artifactKey !== 'string' ||
    !artifactKey.startsWith('exports/orders/') ||
    artifactKey.includes('..') ||
    typeof artifactExpiresAt !== 'string'
  ) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }

  const expiry = Date.parse(artifactExpiresAt);
  if (!Number.isFinite(expiry)) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }
  if (expiry <= Date.now()) {
    await deletePrivateS3Object(artifactKey).catch(() => undefined);
    return NextResponse.json({ error: 'Export file expired.' }, { status: 410 });
  }

  const object = await readPrivateS3Object(artifactKey).catch((error: unknown) => {
    if (isS3ObjectNotFound(error)) return null;
    throw error;
  });
  if (!object) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }
  if (!object.Body) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }
  const fileName = job.fileName?.replace(/["\\\r\n]/g, '_') || 'orders-export.xlsx';
  return new Response(object.Body.transformToWebStream(), {
    headers: {
      'content-type': object.ContentType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (
    !session.user.isAllowed ||
    !canMutateResource(normalizePermissions(session.user.permissions), 'orders')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const requesterKey = getRequesterKey(session);
  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!requesterKey || !jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }
  const job = await getLatestExportJob(ADMIN_ORDER_EXPORT_QUEUE, requesterKey);
  const artifactKey = job?.resultSummary?.artifactKey;
  if (
    job?.id !== jobId ||
    typeof artifactKey !== 'string' ||
    !artifactKey.startsWith('exports/orders/') ||
    artifactKey.includes('..')
  ) {
    return NextResponse.json({ error: 'Export file not found.' }, { status: 404 });
  }
  await deletePrivateS3Object(artifactKey);
  return NextResponse.json({ ok: true });
}
