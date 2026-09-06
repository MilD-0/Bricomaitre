import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { AdminMutationIdempotencyConflictError } from '../../../../../lib/admin-mutation-idempotency';
import { refreshAnalyticsFactsAfterMutation } from '../../../../../lib/analytics-facts';
import {
  createProfitTrackerCost,
  listProfitTrackerCosts,
  profitTrackerCostCreateSchema,
} from '../../../../../lib/profit-tracker';
import { requireAnalyticsAccess, requireMutationAccess } from '../../../../../lib/rbac';

export async function GET() {
  const denied = await requireAnalyticsAccess();
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  return NextResponse.json({ data: await listProfitTrackerCosts() });
}

export async function POST(request: Request) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = profitTrackerCostCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { requestId, ...input } = parsed.data;
  let data;
  try {
    data = await createProfitTrackerCost(input, getDb(), requestId);
  } catch (error) {
    if (error instanceof AdminMutationIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
  await refreshAnalyticsFactsAfterMutation();
  return NextResponse.json({ data });
}
