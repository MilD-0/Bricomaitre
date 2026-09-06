import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { auth } from '../../../../lib/auth';
import {
  adCostEntrySchema,
  deleteAdCostEntry,
  deleteAdSpendImportBatch,
  listAdCosts,
  listAdSpendImportBatches,
  upsertAdCostEntry,
} from '../../../../lib/stats-ad-costs';
import { statsQuerySchema } from '../../../../lib/stats-contract';
import { requireAnalyticsAccess } from '../../../../lib/rbac';
import { triggerAdminReportingRefresh } from '../../../../lib/reporting-refresh-trigger';

export async function GET(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  if (request.nextUrl.searchParams.get('batches') === 'true') {
    return NextResponse.json({ data: await listAdSpendImportBatches() });
  }

  const parsed = statsQuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? 'all',
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ data: await listAdCosts(parsed.data) });
}

export async function POST(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adCostEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await auth();
  const row = await upsertAdCostEntry(parsed.data, {
    email: session?.user?.email,
    name: session?.user?.name,
  });
  await triggerAdminReportingRefresh('ad-cost-upsert');
  return NextResponse.json({ data: row });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const batchId = request.nextUrl.searchParams.get('batchId')?.trim();
  if (batchId) {
    const deleted = await deleteAdSpendImportBatch(batchId);
    if (!deleted) {
      return NextResponse.json({ error: 'Ad spend import batch not found' }, { status: 404 });
    }

    await triggerAdminReportingRefresh('ad-spend-import-batch-delete');
    return NextResponse.json({ data: deleted });
  }

  const rawId = request.nextUrl.searchParams.get('id');
  const id = parsePositiveIntegerId(rawId ?? '');
  if (id === null) {
    return NextResponse.json({ error: 'Invalid ad cost entry id' }, { status: 400 });
  }

  const session = await auth();
  const deleted = await deleteAdCostEntry(id, {
    email: session?.user?.email,
    name: session?.user?.name,
  });
  if (!deleted) {
    return NextResponse.json({ error: 'Ad cost entry not found' }, { status: 404 });
  }

  await triggerAdminReportingRefresh('ad-cost-delete');
  return NextResponse.json({ data: deleted });
}
