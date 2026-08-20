import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';

import { analytics2QuerySchema, getAnalytics2Data } from '../../../lib/analytics2';
import { requireAnalyticsAccess } from '../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = analytics2QuerySchema.safeParse({
    view: request.nextUrl.searchParams.get('view') ?? undefined,
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    grain: request.nextUrl.searchParams.get('grain') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await getAnalytics2Data(parsed.data);
  return NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        'Server-Timing': `analytics2;dur=${data.diagnostics.queryDurationMs}`,
        'X-Analytics-Coverage': data.warnings.length ? 'partial' : 'complete',
      },
    },
  );
}
