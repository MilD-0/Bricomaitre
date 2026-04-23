import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '../../../../db/client';
import { listPaidClickVisits, paidClickListQuerySchema } from '../../../../lib/paid-clicks';
import { requireAdministrationAccess } from '../../../../lib/rbac';

export async function GET(request: NextRequest) {
  const denied = await requireAdministrationAccess();
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = paidClickListQuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? undefined,
    startDate: request.nextUrl.searchParams.get('startDate') ?? undefined,
    endDate: request.nextUrl.searchParams.get('endDate') ?? undefined,
    variant: request.nextUrl.searchParams.get('variant') ?? undefined,
    paidSource: request.nextUrl.searchParams.get('paidSource') ?? undefined,
    outcome: request.nextUrl.searchParams.get('outcome') ?? undefined,
    search: request.nextUrl.searchParams.get('search') ?? undefined,
    hasOrder: request.nextUrl.searchParams.get('hasOrder') ?? undefined,
    cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await listPaidClickVisits(parsed.data));
}
