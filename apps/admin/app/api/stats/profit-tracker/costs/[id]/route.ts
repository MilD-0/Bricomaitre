import { NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  deleteProfitTrackerCost,
  profitTrackerCostSchema,
  updateProfitTrackerCost,
} from '../../../../../../lib/profit-tracker';
import { requireMutationAccess } from '../../../../../../lib/rbac';

async function costId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return parsePositiveIntegerId(id);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const id = await costId(params);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid operating-cost id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = profitTrackerCostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await updateProfitTrackerCost(id, parsed.data);
  return row
    ? NextResponse.json({ data: row })
    : NextResponse.json({ error: 'Operating cost not found' }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('stats');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }
  const id = await costId(params);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid operating-cost id' }, { status: 400 });
  }
  const deleted = await deleteProfitTrackerCost(id);
  return deleted
    ? NextResponse.json({ data: { id: deleted } })
    : NextResponse.json({ error: 'Operating cost not found' }, { status: 404 });
}
