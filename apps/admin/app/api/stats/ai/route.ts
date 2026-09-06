import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';

import { aiStatsQuerySchema, getAiStatsData } from '../../../../lib/ai-stats';
import { requireAnalyticsAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = aiStatsQuerySchema.safeParse({
    surface: request.nextUrl.searchParams.get('surface') ?? undefined,
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    grain: request.nextUrl.searchParams.get('grain') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await getAiStatsData(parsed.data);
  return NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': 'private, no-cache, must-revalidate',
        'Server-Timing': `stats;dur=${data.diagnostics.queryDurationMs}`,
        'X-Stats-Response-Bytes': String(data.diagnostics.responseSizeBytes),
      },
    },
  );
}
