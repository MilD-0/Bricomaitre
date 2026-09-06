import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb } from '@bric/db/client';
import { MetaAdsSyncError, syncMetaAdsInsights } from '../../../../../lib/meta-ads-insights';
import { getProfitTrackerReport } from '../../../../../lib/profit-tracker';
import { requireMutationAccess } from '../../../../../lib/rbac';

import { reportingDateSchema as dateSchema } from '../../../../../lib/analytics/contract';
const inputSchema = z
  .union([
    z.object({ date: dateSchema }).strict(),
    z.object({ since: dateSchema, until: dateSchema }).strict(),
  ])
  .superRefine((value, context) => {
    if ('date' in value) return;
    const since = Date.parse(`${value.since}T00:00:00Z`);
    const until = Date.parse(`${value.until}T00:00:00Z`);
    if (since > until) {
      context.addIssue({ code: 'custom', message: 'since must not follow until.' });
    }
    if (until - since > 89 * 24 * 60 * 60 * 1_000) {
      context.addIssue({ code: 'custom', message: 'Meta synchronization is capped at 90 days.' });
    }
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
    const since = 'date' in parsed.data ? parsed.data.date : parsed.data.since;
    const until = 'date' in parsed.data ? parsed.data.date : parsed.data.until;
    const lookbackDays =
      Math.floor(
        (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) /
          (24 * 60 * 60 * 1_000),
      ) + 1;
    const sync = await syncMetaAdsInsights({
      since,
      until,
      lookbackDays,
      trigger: 'manual-profit-tracker',
    });
    const report = await getProfitTrackerReport({
      range: 'custom',
      startDate: since,
      endDate: until,
    });
    return NextResponse.json({
      data: 'date' in parsed.data ? (report.days[0] ?? null) : report,
      report,
      sync,
    });
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
