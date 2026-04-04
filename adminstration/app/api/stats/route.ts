import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../db/client';
import { auth } from '../../../lib/auth';
import { ADMIN_STATS_IMPORT_QUEUE, getLatestExportJob, startStatsImportJob } from '../../../lib/background-jobs';
import { deleteImportBatch, dismissUnmatchedReference, getStatsDashboard, listImportHistory, statsQuerySchema } from '../../../lib/stats';
import { requireOpsAccess } from '../../../lib/rbac';
import { CACHE_TAGS, revalidateServerTags } from '../../../lib/server-cache';

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
    return NextResponse.json({ data: await listImportHistory() });
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
