import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';

import { analyticsQuerySchema } from '@/lib/analytics';
import { getAnalyticsSnapshot } from '@/lib/analytics-snapshots';
import { requireAnalyticsAccess } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = analyticsQuerySchema.safeParse({
    view: request.nextUrl.searchParams.get('view') ?? undefined,
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    grain: request.nextUrl.searchParams.get('grain') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startedAt = performance.now();
  const data = await getAnalyticsSnapshot(parsed.data, {
    refresh: request.nextUrl.searchParams.get('refresh') === '1',
  });
  return NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': 'private, no-cache, must-revalidate',
        'Server-Timing': `stats;dur=${Math.round(performance.now() - startedAt)}`,
        'X-Analytics-Cache': data.diagnostics.cache?.state ?? 'bypass',
        'X-Analytics-Coverage': data.warnings.length ? 'partial' : 'complete',
      },
    },
  );
}
