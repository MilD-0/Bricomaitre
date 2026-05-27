import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../db/client';
import { auth } from '../../../lib/auth';
import { ADMIN_STATS_IMPORT_QUEUE, getLatestExportJob, startStatsImportJob } from '../../../lib/background-jobs';
import {
  deleteImportBatch,
  dismissUnmatchedReference,
  getStatsDashboard,
  IMPORT_HISTORY_PAGE_SIZE,
  listImportHistoryPage,
  refreshStatsDashboard,
  statsQuerySchema,
} from '../../../lib/stats';
import { requireOpsAccess } from '../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../lib/server-cache';
import { triggerAdminReportingRefresh } from '../../../lib/reporting-refresh-trigger';

function getRequesterKey(email: string | null | undefined) {
  return email?.trim() || 'ops';
}

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
    const page = Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
    const pageSize = Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? String(IMPORT_HISTORY_PAGE_SIZE), 10);

    return NextResponse.json({
      data: await listImportHistoryPage({
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : IMPORT_HISTORY_PAGE_SIZE,
      }),
    });
  }

  if (jobOnly) {
    const session = await auth();
    return NextResponse.json({ job: await getLatestExportJob(ADMIN_STATS_IMPORT_QUEUE, getRequesterKey(session?.user?.email)) });
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

export async function POST(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const session = await auth();
  const result = await startStatsImportJob(getRequesterKey(session?.user?.email), {
    fileName: file.name,
    fileBuffer: Buffer.from(await file.arrayBuffer()),
  });

  return NextResponse.json({ job: result.job }, { status: result.kind === 'started' ? 201 : 200 });
}

export async function PUT(request: NextRequest) {
  const denied = await requireOpsAccess();

  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = statsQuerySchema.safeParse({
    range: body?.range ?? undefined,
    startDate: body?.startDate ?? undefined,
    endDate: body?.endDate ?? undefined,
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
