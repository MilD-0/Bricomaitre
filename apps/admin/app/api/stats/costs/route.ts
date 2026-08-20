import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { requireAnalyticsAccess } from '../../../../lib/rbac';
import { getCostsAndAssumptions } from '../../../../lib/stats-sections';
import { statsQuerySchema } from '../../../../lib/stats';

export async function GET(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const parsed = statsQuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = await getCostsAndAssumptions(parsed.data);
  return NextResponse.json(
    { data },
    {
      headers: {
        'Server-Timing': `stats;dur=${data.diagnostics.queryDurationMs}`,
        'X-Stats-Response-Bytes': String(data.diagnostics.responseSizeBytes),
      },
    },
  );
}
