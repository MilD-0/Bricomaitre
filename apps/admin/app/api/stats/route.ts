import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { ADMIN_STATS_IMPORT_QUEUE, getLatestExportJob } from '../../../lib/background-jobs';
import {
  deleteImportBatch,
  dismissUnmatchedReference,
  IMPORT_HISTORY_PAGE_SIZE,
  listImportHistoryPage,
} from '../../../lib/stats-order-import';
import { requireAnalyticsAccess } from '../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../lib/server-cache';
import { triggerAdminReportingRefresh } from '../../../lib/reporting-refresh-trigger';

const importHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(IMPORT_HISTORY_PAGE_SIZE),
});
export async function GET(request: NextRequest) {
  const { response: denied, session } = await requireAnalyticsAccess();

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
    return NextResponse.json({
      job: await getLatestExportJob(
        ADMIN_STATS_IMPORT_QUEUE,
        session?.user?.email?.trim() || 'ops',
      ),
    });
  }

  return NextResponse.json(
    { error: 'Use /api/stats/workspace for analytics reports.' },
    { status: 410 },
  );
}

export async function DELETE(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();

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
  const { response: denied } = await requireAnalyticsAccess();

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
