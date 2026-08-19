import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { MetaAdsSyncError, syncMetaAdsInsights } from '../../../../../lib/meta-ads-insights';
import { getProfitTrackerReport } from '../../../../../lib/profit-tracker';
import { requireMutationAccess } from '../../../../../lib/rbac';

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sync = await syncMetaAdsInsights({
      since: parsed.data.date,
      until: parsed.data.date,
      lookbackDays: 1,
      trigger: 'manual-profit-tracker',
    });
    const report = await getProfitTrackerReport({
      range: 'custom',
      startDate: parsed.data.date,
      endDate: parsed.data.date,
    });
    return NextResponse.json({ data: report.days[0] ?? null, sync });
  } catch (error) {
    if (error instanceof MetaAdsSyncError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status && error.status >= 400 ? error.status : 502 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Meta synchronization failed.' },
      { status: 502 },
    );
  }
}
