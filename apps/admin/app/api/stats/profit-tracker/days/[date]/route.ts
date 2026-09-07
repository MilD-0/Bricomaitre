import { NextResponse } from 'next/server';

import { reportingDateSchema } from '@/lib/analytics/contract';
import { hasDb } from '@bric/db/client';
import { refreshAnalyticsFactsAfterMutation } from '@/lib/analytics-facts';
import { deleteProfitTrackerDay } from '@/lib/profit-tracker';
import { requireMutationAccess } from '@/lib/rbac';

export async function DELETE(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { response: denied } = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const { date } = await params;
  const parsed = reportingDateSchema.safeParse(date);
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid profit-tracker date' }, { status: 400 });
  const deleted = await deleteProfitTrackerDay(parsed.data);
  if (deleted) await refreshAnalyticsFactsAfterMutation();
  return deleted
    ? NextResponse.json({ data: { date: deleted } })
    : NextResponse.json({ error: 'Profit-tracker day not found' }, { status: 404 });
}
