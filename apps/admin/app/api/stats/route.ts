import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { auth } from '../../../lib/auth';
import { ADMIN_STATS_IMPORT_QUEUE, getLatestExportJob } from '../../../lib/background-jobs';
import { getStatsDashboard, refreshStatsDashboard, statsQuerySchema } from '../../../lib/stats';
import {
  deleteImportBatch,
  dismissUnmatchedReference,
  IMPORT_HISTORY_PAGE_SIZE,
  listImportHistoryPage,
} from '../../../lib/stats-order-import';
import { requireOpsAccess } from '../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../lib/server-cache';
import { triggerAdminReportingRefresh } from '../../../lib/reporting-refresh-trigger';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

const importHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(IMPORT_HISTORY_PAGE_SIZE),
});

export async function GET(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const historyOnly = request.nextUrl.searchParams.get('history') === 'true';
  const jobOnly = request.nextUrl.searchParams.get('job') === 'true';

  if (historyOnly) {
    const parsed = importHistoryQuerySchema.safeParse({
      page: request.nextUrl.searchParams.get('page') ?? undefined,
      pageSize: request.nextUrl.searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    return NextResponse.json({
      data: await listImportHistoryPage(parsed.data),
    });
  }

  if (jobOnly) {
    const session = await auth();
    return NextResponse.json({
      job: await getLatestExportJob(
        ADMIN_STATS_IMPORT_QUEUE,
        getRequesterKey(session?.user?.email),
      ),
    });
  }

  const parsed = statsQuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ data: await getStatsDashboard(parsed.data) });
}

export async function PUT(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = statsQuerySchema.safeParse({
    range: 'range' in body ? body.range : undefined,
    startDate: 'startDate' in body ? body.startDate : undefined,
    endDate: 'endDate' in body ? body.endDate : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await refreshStatsDashboard(parsed.data, 'manual-refresh');
  revalidateServerTags(CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const batchId = request.nextUrl.searchParams.get('batchId')?.trim();

  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const result = await deleteImportBatch(batchId);

  if (!result.deletedBatch) {
    return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
  }

  await triggerAdminReportingRefresh('stats-import-delete');
  revalidateServerTags(CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  return NextResponse.json({ data: result });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const batchId = typeof body?.batchId === 'string' ? body.batchId.trim() : '';
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';

  if (!batchId || !reference) {
    return NextResponse.json({ error: 'batchId and reference are required' }, { status: 400 });
  }

  const result = await dismissUnmatchedReference(batchId, reference);

  if (!result) {
    return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
  }

  revalidateServerTags(CACHE_TAGS.stats, CACHE_TAGS.statsHistory);

  return NextResponse.json({ data: result });
}
