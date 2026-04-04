import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../db/client';
import { auth } from '../../../../lib/auth';
import { adCostEntrySchema, deleteAdCostEntry, listAdCosts, statsQuerySchema, upsertAdCostEntry } from '../../../../lib/stats';
import { requireOpsAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireOpsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = statsQuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? 'all',
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ data: await listAdCosts(parsed.data as any) });
}

export async function POST(request: NextRequest) {
  const denied = await requireOpsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adCostEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await auth();
  const row = await upsertAdCostEntry(parsed.data, { email: session?.user?.email, name: session?.user?.name });
  return NextResponse.json({ data: row });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireOpsAccess();
  if (denied) return denied;

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const id = request.nextUrl.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const session = await auth();
  const deleted = await deleteAdCostEntry(id, { email: session?.user?.email, name: session?.user?.name });
  if (!deleted) {
    return NextResponse.json({ error: 'Ad cost entry not found' }, { status: 404 });
  }

  return NextResponse.json({ data: deleted });
}
