import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  getProfitTrackerReport,
  profitTrackerDaySchema,
  profitTrackerRangeSchema,
  upsertProfitTrackerDay,
} from '../../../../../lib/profit-tracker';
import { requireAnalyticsAccess, requireMutationAccess } from '../../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const parsed = profitTrackerRangeSchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const report = await getProfitTrackerReport(parsed.data);
  return NextResponse.json({ data: report.days });
}

export async function POST(request: Request) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = profitTrackerDaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ data: await upsertProfitTrackerDay(parsed.data) });
}
