import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { requireAnalyticsAccess } from './rbac';
import { getAnalyticsSectionData, type AnalyticsSection } from './stats-sections';
import { statsQuerySchema } from './stats';

function queryInput(request: NextRequest) {
  return {
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  };
}

function response(data: Awaited<ReturnType<typeof getAnalyticsSectionData>>) {
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

export function createStatsSectionHandlers(section: AnalyticsSection) {
  return {
    async GET(request: NextRequest) {
      const denied = await requireAnalyticsAccess();
      if (denied) return denied;
      if (!hasDb()) {
        return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
      }
      const parsed = statsQuerySchema.safeParse(queryInput(request));
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      return response(await getAnalyticsSectionData(section, parsed.data));
    },
    async PUT(request: NextRequest) {
      const denied = await requireAnalyticsAccess();
      if (denied) return denied;
      if (!hasDb()) {
        return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
      }
      const body = await request.json().catch(() => null);
      const parsed = statsQuerySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      return response(await getAnalyticsSectionData(section, parsed.data, true));
    },
  };
}
