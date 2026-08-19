import { NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import {
  getProfitTrackerSettings,
  profitTrackerSettingsSchema,
  updateProfitTrackerSettings,
} from '../../../../../lib/profit-tracker';
import { requireAnalyticsAccess, requireMutationAccess } from '../../../../../lib/rbac';

export async function GET() {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  return NextResponse.json({ data: await getProfitTrackerSettings() });
}

export async function PUT(request: Request) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = profitTrackerSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ data: await updateProfitTrackerSettings(parsed.data) });
}
