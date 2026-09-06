import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { getProfitTrackerReport, profitTrackerRangeSchema } from '../../../../lib/profit-tracker';
import { requireAnalyticsAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();
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

  return NextResponse.json({ data: await getProfitTrackerReport(parsed.data) });
}
