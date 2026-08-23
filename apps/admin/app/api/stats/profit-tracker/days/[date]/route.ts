import { NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { refreshAnalytics2FactsAfterMutation } from '../../../../../../lib/analytics2-facts';
import { deleteProfitTrackerDay } from '../../../../../../lib/profit-tracker';
import { requireMutationAccess } from '../../../../../../lib/rbac';

export async function DELETE(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const { date } = await params;
  try {
    const deleted = await deleteProfitTrackerDay(date);
    if (deleted) await refreshAnalytics2FactsAfterMutation();
    return deleted
      ? NextResponse.json({ data: { date: deleted } })
      : NextResponse.json({ error: 'Profit-tracker day not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Invalid profit-tracker date' }, { status: 400 });
  }
}
